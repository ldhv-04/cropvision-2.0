import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as Location from 'expo-location';
import { generateUuidV7, type CanopyLayer, type SegmentationResult } from '@cropvision/domain';
import { Btn, Slider, colors, s, severityColor, useDbQuery } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';
import { useCameraStabilityGate } from '../services/camera-gate';
import { segmentationEngine } from '../services/analysis';
import { saveSampleImage } from '../services/media';
import { finishSession, recordSample, startSession } from '../services/scouting';
import { bearingDeg, distanceM, relativeBearing, type LatLng } from '../lib/geo';
import type { ScoutTarget } from './WorkOrderListScreen';

const LAYERS: CanopyLayer[] = ['TOP', 'MID', 'LOW'];

export function GuidedScoutingScreen({ exec, deviceId, target, onDone }: { exec: SqlExecutor; deviceId: string; target: ScoutTarget; onDone: () => void }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cam = useRef<Camera>(null);
  const gate = useCameraStabilityGate();
  const [sessionId, setSessionId] = useState<string>();
  const [pos, setPos] = useState<LatLng>();
  const [heading, setHeading] = useState(0);
  const [layer, setLayer] = useState<CanopyLayer>('LOW');
  const [manual, setManual] = useState(false);
  const [manualDs, setManualDs] = useState(0);
  const [last, setLast] = useState<SegmentationResult>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [summary, setSummary] = useState<{ di: number; bsi: number; code: string; text: string }>();
  const cps = useDbQuery<any>(exec, 'SELECT id, sequence_order, latitude, longitude FROM scouting_checkpoints WHERE block_id = ? AND deleted_at IS NULL ORDER BY sequence_order', [target.blockId]);
  const done = useDbQuery<any>(exec, 'SELECT checkpoint_id, ds_index_pct FROM leaf_samples WHERE session_id = ?', [sessionId ?? ''], [sessionId, last]);

  useEffect(() => { void requestPermission(); void Location.requestForegroundPermissionsAsync(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void startSession(exec, { blockId: target.blockId, workOrderId: target.workOrderId, deviceId }).then((r) => setSessionId(r.id)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let a: Location.LocationSubscription | undefined, b: Location.LocationSubscription | undefined;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (l) => setPos(l.coords)).then((x) => (a = x)).catch(() => undefined);
    void Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading)).then((x) => (b = x)).catch(() => undefined);
    return () => { a?.remove(); b?.remove(); };
  }, []);

  const visited = new Set(done.rows.map((r) => r.checkpoint_id));
  const next = cps.rows.find((c) => !visited.has(c.id));
  const dist = pos && next ? distanceM(pos, next) : undefined;
  const turn = pos && next ? relativeBearing(heading, bearingDeg(pos, next)) : 0;
  const canShoot = gate.isStable && !busy && !!sessionId && !!device;

  const capture = async () => {
    if (!cam.current || !sessionId) return;
    setBusy(true); setErr(undefined);
    try {
      const photo = await cam.current.takePhoto({ flash: 'off' });
      const id = generateUuidV7();
      const saved = await saveSampleImage({ path: photo.path }, id);
      let result: SegmentationResult;
      if (manual) result = { leafPixelCount: 10_000, lesionPixelCount: manualDs * 100, dsIndexPct: manualDs, uncertaintyEntropy: 0, inferenceLatencyMs: 0, engineVersion: 'manual-slider' };
      else {
        try { result = await segmentationEngine.analyzeFrame(saved.uri); }
        catch (e) { setManual(true); throw new Error(`Phân đoạn tự động lỗi (${(e as Error).message}) — chuyển sang chọn mức bệnh thủ công`); }
      }
      await recordSample(exec, {
        id, sessionId, checkpointId: next?.id ?? null, canopyLayer: layer, latitude: pos?.latitude ?? next?.latitude ?? 0, longitude: pos?.longitude ?? next?.longitude ?? 0,
        imuStabilityScore: gate.stabilityScore, result, imageRelativeKey: saved.relativeKey,
      });
      setLast(result);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const finish = async () => {
    if (!sessionId) return;
    try {
      const r = await finishSession(exec, sessionId);
      setSummary({ di: r.diseaseIncidencePct, bsi: r.blockSeverityIndexPct, code: r.recommendationCode, text: r.recommendationSummary });
    } catch (e) { setErr((e as Error).message); }
  };

  if (summary) {
    return (
      <View style={s.screen}>
        <Text style={s.h1}>Kết quả phiên · {target.blockName}</Text>
        <View style={s.card}>
          <Text testID="summary-di">DI: {summary.di.toFixed(1)} %</Text>
          <Text testID="summary-bsi" style={{ color: severityColor(summary.bsi), fontWeight: '800', fontSize: 22 }}>BSI: {summary.bsi.toFixed(1)} %</Text>
          <Text style={{ fontWeight: '700', marginTop: 6 }}>{summary.code}</Text>
          <Text>{summary.text}</Text>
        </View>
        <Btn title="Xong — về danh sách việc" onPress={onDone} />
      </View>
    );
  }
  if (!hasPermission) return <View style={s.screen}><Text>Cần quyền camera để khảo sát.</Text><Btn title="Cấp quyền" onPress={requestPermission} /></View>;
  if (!device) return <View style={s.screen}><Text testID="no-camera">Không tìm thấy camera sau.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera ref={cam} style={{ flex: 1 }} device={device} isActive photo />
      {/* square viewfinder = the region saved as the 1024×1024 sample */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 60, alignSelf: 'center', width: 280, height: 280, borderWidth: 3, borderColor: gate.isStable ? colors.green : colors.red, borderRadius: 8 }} />
      <View style={{ position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: '#000a', borderRadius: 8, padding: 8 }}>
        <Text style={{ color: '#fff' }}>{target.blockName} · mẫu {done.rows.length}{cps.rows.length ? `/${cps.rows.length}` : ''}</Text>
        {next && dist !== undefined
          ? <Text style={{ color: '#fff' }} testID="guide">
              <Text style={{ fontSize: 22, transform: [{ rotate: `${turn}deg` }] }}>⬆ </Text>điểm {next.sequence_order}: {dist.toFixed(0)} m · quay {turn > 0 ? 'phải' : 'trái'} {Math.abs(turn).toFixed(0)}°
            </Text>
          : <Text style={{ color: '#ddd' }}>{next ? 'Đang chờ GPS…' : 'Đã đi hết tuyến (hoặc lô chưa có tuyến) — chụp tự do'}</Text>}
        <Text style={{ color: gate.isStable ? '#9f9' : '#f99' }} testID="gate-status">
          {gate.isStable ? '✔ Tay vững' : gate.lockReason === 'CALIBRATING' ? '… hiệu chuẩn cảm biến' : '✋ Rung tay — nút chụp bị khóa'} (Δa {gate.stabilityScore.toFixed(2)} m/s²)
        </Text>
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#000c', padding: 10, gap: 8 }}>
        {last && <Text style={{ color: severityColor(last.dsIndexPct), fontWeight: '800', fontSize: 18 }} testID="last-ds">DS {last.dsIndexPct.toFixed(1)} % ({last.engineVersion})</Text>}
        {err && <Text style={{ color: '#ff8a80' }}>{err}</Text>}
        <View style={s.row}>
          {LAYERS.map((l) => <Btn key={l} title={l} color={l === layer ? colors.green : '#546e7a'} onPress={() => setLayer(l)} style={{ minHeight: 40, paddingVertical: 8 }} />)}
          <Btn title={manual ? 'Thủ công ✓' : 'Thủ công'} color={manual ? colors.amber : '#546e7a'} onPress={() => setManual((m) => !m)} style={{ minHeight: 40, paddingVertical: 8 }} />
        </View>
        {manual && <View><Text style={{ color: '#fff' }}>Mức bệnh DS: {manualDs} %</Text><Slider value={manualDs} onChange={setManualDs} /></View>}
        <View style={s.row}>
          <Btn testID="shutter" title={busy ? '…' : gate.isStable ? '📷 Chụp' : '🔒 Khóa'} onPress={capture} disabled={!canShoot} color={gate.isStable ? colors.green : colors.red} style={{ flex: 1 }} />
          <Btn testID="finish" title="Kết thúc phiên" onPress={finish} color="#37474f" disabled={done.rows.length === 0} />
        </View>
        {busy && <ActivityIndicator color="#fff" />}
      </View>
    </View>
  );
}
