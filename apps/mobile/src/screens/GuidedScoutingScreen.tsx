import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as Location from 'expo-location';
import { generateUuidV7, type CanopyLayer, type SegmentationResult } from '@cropvision/domain';
import { Btn, MONO, Slider, severityColor, useDbQuery, useHmi } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';
import { useCameraStabilityGate } from '../services/camera-gate';
import { segmentationEngine } from '../services/analysis';
import { saveSampleImage } from '../services/media';
import { finishSession, recordSample, startSession } from '../services/scouting';
import { bearingDeg, distanceM, relativeBearing, type LatLng } from '../lib/geo';
import { CANOPY_OPTIONS, DEFAULT_CANOPY, checkpointProgress, reticleState } from '../lib/hmi';
import type { ScoutTarget } from './WorkOrderListScreen';

// Over the live camera feed the HUD uses fixed white-on-black ink, independent of the daylight palette.
const HUD_INK = '#FFFFFF';
const HUD_DIM = '#E2E8F0';
// The camera screen is full-bleed, so the top bar must clear the Android status bar itself.
const STATUS_BAR = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 44;
const RETICLE_TOP = STATUS_BAR + 112;

export function GuidedScoutingScreen({ exec, deviceId, target, onDone }: { exec: SqlExecutor; deviceId: string; target: ScoutTarget; onDone: () => void }) {
  const { c, s } = useHmi();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cam = useRef<Camera>(null);
  const gate = useCameraStabilityGate();
  const [sessionId, setSessionId] = useState<string>();
  const [pos, setPos] = useState<LatLng>();
  const [heading, setHeading] = useState(0);
  const [layer, setLayer] = useState<CanopyLayer>(DEFAULT_CANOPY);
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
  const next = cps.rows.find((cp) => !visited.has(cp.id));
  const dist = pos && next ? distanceM(pos, next) : undefined;
  const turn = pos && next ? relativeBearing(heading, bearingDeg(pos, next)) : 0;
  const reticle = reticleState(gate);
  const canShoot = reticle.shutterEnabled && !busy && !!sessionId && !!device;

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
          <Text testID="summary-di" style={[s.mono, { fontSize: 18 }]}>DI {summary.di.toFixed(1)} %</Text>
          <Text testID="summary-bsi" style={[s.mono, { color: severityColor(c, summary.bsi), fontWeight: '800', fontSize: 28 }]}>BSI {summary.bsi.toFixed(1)} %</Text>
          <Text style={[s.mono, { fontWeight: '700', marginTop: 6 }]}>{summary.code}</Text>
          <Text style={s.text}>{summary.text}</Text>
        </View>
        <Btn title="XONG — VỀ DANH SÁCH VIỆC" onPress={onDone} />
      </View>
    );
  }
  if (!hasPermission) return <View style={[s.screen, { gap: 12 }]}><Text style={s.text}>Cần quyền camera để khảo sát.</Text><Btn title="Cấp quyền" onPress={requestPermission} /></View>;
  if (!device) return <View style={s.screen}><Text testID="no-camera" style={s.text}>Không tìm thấy camera sau.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera ref={cam} style={{ flex: 1 }} device={device} isActive photo />
      {/* square reticle = the region saved as the 1024×1024 sample; colour and width follow the IMU gate */}
      <View pointerEvents="none" style={{ position: 'absolute', top: RETICLE_TOP, alignSelf: 'center', width: 280, height: 280, borderWidth: reticle.width, borderColor: reticle.color, borderRadius: 4 }} />
      {/* banner sits inside the reticle's top edge: below it, the thumb deck covers it on short phones (seen on a 640dp emulator) */}
      {reticle.banner && (
        <View pointerEvents="none" style={{ position: 'absolute', top: RETICLE_TOP + 12, alignSelf: 'center', maxWidth: 260, backgroundColor: reticle.color, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text testID="gate-banner" style={{ color: HUD_INK, fontWeight: '900', fontSize: 15 }}>{reticle.banner}</Text>
        </View>
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingTop: STATUS_BAR + 8, paddingBottom: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: HUD_INK, fontWeight: '700', fontSize: 16, flexShrink: 1 }}>{target.blockName}</Text>
          <Text style={{ color: HUD_INK, fontWeight: '900', fontSize: 16, fontFamily: MONO }}>{checkpointProgress(visited.size, cps.rows.length)}</Text>
        </View>
        {next && dist !== undefined
          ? <View testID="guide" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: HUD_INK, fontSize: 26, transform: [{ rotate: `${turn}deg` }] }}>⬆</Text>
              <Text style={{ color: HUD_INK, fontSize: 16, fontFamily: MONO }}>điểm {next.sequence_order}: {dist.toFixed(0)} m · {turn > 0 ? 'phải' : 'trái'} {Math.abs(turn).toFixed(0)}°</Text>
            </View>
          : <Text style={{ color: HUD_DIM, fontSize: 14 }}>{next ? 'Đang chờ GPS…' : 'Đã đi hết tuyến (hoặc lô chưa có tuyến) — chụp tự do'}</Text>}
        <Text testID="gate-status" style={{ color: HUD_DIM, fontSize: 13, fontFamily: MONO }}>
          {gate.isStable ? '✔ Tay vững' : gate.lockReason === 'CALIBRATING' ? '… hiệu chuẩn cảm biến' : '✋ Rung tay — nút chụp bị khóa'} (Δa {gate.stabilityScore.toFixed(2)} m/s²)
        </Text>
      </View>

      {/* thumb-zone deck: daylight surface, 2px top border */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.bg, borderTopWidth: 2, borderColor: c.border, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CANOPY_OPTIONS.map((o) => <Btn key={o.layer} testID={`layer-${o.layer}`} title={o.label} variant="outline" selected={o.layer === layer} height={48} onPress={() => setLayer(o.layer)} style={{ flex: 1, paddingHorizontal: 4 }} />)}
        </View>
        {manual && <View style={{ gap: 6 }}><Text style={s.text}>Mức bệnh DS (thủ công): <Text style={s.mono}>{manualDs} %</Text></Text><Slider value={manualDs} onChange={setManualDs} /></View>}
        {err && <Text style={{ color: c.danger, fontWeight: '700' }}>{err}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text testID="last-ds" style={{ fontFamily: MONO, fontVariant: ['tabular-nums'], fontWeight: '800', fontSize: 28, color: last ? severityColor(c, last.dsIndexPct) : c.muted }}>
              {last ? `${last.dsIndexPct.toFixed(1)}%` : '—'}
            </Text>
            <Text style={[s.muted, { fontFamily: MONO }]}>{last ? `${last.inferenceLatencyMs.toFixed(0)} ms · ${last.engineVersion}` : 'DS% mẫu gần nhất'}</Text>
          </View>
          {busy && <ActivityIndicator color={c.primary} />}
          <Btn testID="shutter" title={reticle.shutterEnabled ? 'GHI NHẬN MẪU LÁ' : 'KHÓA'} onPress={capture} disabled={!canShoot} height={64} style={{ flex: 1.3 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title={manual ? 'Thủ công ✓' : 'Thủ công'} variant="outline" selected={manual} onPress={() => setManual((m) => !m)} style={{ flex: 1 }} />
          <Btn testID="finish" title="Kết thúc phiên" variant="secondary" onPress={finish} disabled={done.rows.length === 0} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}
