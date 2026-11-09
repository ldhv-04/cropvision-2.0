import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { encodeLeaseFrame, planVenturiFertigation, type Lease } from '@cropvision/domain';
import { Btn, MONO, PressureGauge, SlideToActuate, useDbQuery, useHmi } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';
import { createValveService } from '../services/valve';

type Kind = 'DRIP' | 'VENTURI';
const KIND_LABEL: Record<Kind, string> = { DRIP: 'Nhỏ giọt 10 phút / 200 L', VENTURI: 'Venturi 2,5 bar' };

export function LocalValveControlScreen({ exec }: { exec: SqlExecutor }) {
  const { c, s, palette } = useHmi();
  const blocks = useDbQuery<any>(exec, 'SELECT id, name, tree_count, nominal_drip_flow_lph FROM blocks WHERE deleted_at IS NULL ORDER BY name');
  const [blockId, setBlockId] = useState<string>();
  const [kind, setKind] = useState<Kind>('DRIP');
  const [lease, setLease] = useState<Lease>();
  const [frame, setFrame] = useState<string>();
  const [err, setErr] = useState<string>();
  const svc = useMemo(() => createValveService(exec, (l) => setLease((cur) => (!cur || cur.id === l.id ? l : cur))), [exec]);
  useEffect(() => () => svc.stop(), [svc]);
  const block = blocks.rows.find((b) => b.id === (blockId ?? blocks.rows[0]?.id));
  const active = lease?.status === 'ACTIVE';

  const issue = async () => {
    if (!block) return;
    setErr(undefined);
    try {
      const req = kind === 'DRIP'
        ? { blockId: block.id, mode: 'DRIP_IRRIGATION' as const, maxDurationSec: 600, maxVolumeLiters: 200 }
        : { blockId: block.id, ...planVenturiFertigation({ treeCount: block.tree_count, dripFlowLph: block.nominal_drip_flow_lph, waterPerTreeLiters: 1, fertilizerGramsPerTree: 20, injectorRateLph: 100 }).lease };
      const l = await svc.runner.issue(req);
      setLease(l); setFrame(encodeLeaseFrame(l));
    } catch (e) { setErr((e as Error).message); }
  };
  const statusColor = active ? c.hydraulic : lease?.status.startsWith('ABORTED') ? c.critical : c.ink;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={s.h1}>Điều khiển van (lease có hạn)</Text>
        <Text style={s.muted}>Không có lệnh "bật van" vô thời hạn: mọi lệnh bị chặn bởi thời gian, thể tích và áp suất 2,0–3,5 bar.</Text>
        <View style={s.row}>{blocks.rows.map((b) => <Btn key={b.id} title={b.name} variant="outline" selected={b.id === block?.id} onPress={() => setBlockId(b.id)} />)}</View>
        <View style={s.row}>{(['DRIP', 'VENTURI'] as const).map((k) => <Btn key={k} testID={`kind-${k}`} title={KIND_LABEL[k]} variant="outline" selected={k === kind} onPress={() => setKind(k)} style={{ flex: 1 }} />)}</View>

        <View style={s.card}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
            <Text style={[s.text, { fontWeight: '700' }]}>Áp suất ống</Text>
            <Text style={[s.mono, { fontSize: 22, fontWeight: '700', color: palette.telemetry['hydraulic-fill'] }]}>{lease?.averagePressureBar?.toFixed(2) ?? '—'} bar</Text>
          </View>
          <PressureGauge bar={lease?.averagePressureBar} />
          <Text style={[s.muted, { marginTop: 6 }]}>Vùng tối ưu Venturi 2,3–2,7 bar (xanh coban).</Text>
        </View>

        {lease && (
          <View style={s.card}>
            <Text testID="lease-status" style={{ fontWeight: '800', fontSize: 18, color: statusColor }}>{lease.status}</Text>
            <Text style={[s.mono, { fontSize: 16 }]}>{lease.actualVolumeLiters.toFixed(1)} / {lease.maxVolumeLiters.toFixed(0)} L</Text>
            <Text style={s.muted}>Khung gửi phần cứng (CRC32):</Text>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: c.ink }}>{frame}</Text>
          </View>
        )}
        {err && <Text style={{ color: c.danger, fontWeight: '700' }}>{err}</Text>}
        <Text style={s.muted}>Cổng phần cứng hiện là bộ mô phỏng; BLE thật cần mạch ESP32 (xem UNVERIFIED.md).</Text>
      </ScrollView>

      {/* thumb zone: actuation and emergency stop stay at the bottom, always reachable one-handed */}
      <View style={{ padding: 12, gap: 8, borderTopWidth: 2, borderColor: c.border, backgroundColor: c.card }}>
        {active
          ? <Btn testID="emergency-stop" title="DỪNG KHẨN CẤP" variant="danger" height={64} onPress={() => svc.runner.abort(lease!.id)} />
          : <SlideToActuate testID={kind === 'DRIP' ? 'issue-drip' : 'issue-venturi'} label={`TRƯỢT ĐỂ MỞ VAN · ${KIND_LABEL[kind]}`} disabled={!block} onActuate={issue} />}
      </View>
    </View>
  );
}
