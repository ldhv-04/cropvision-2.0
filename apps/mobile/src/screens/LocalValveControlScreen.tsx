import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { encodeLeaseFrame, planVenturiFertigation, type Lease } from '@cropvision/domain';
import { Btn, colors, s, useDbQuery } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';
import { createValveService } from '../services/valve';

export function LocalValveControlScreen({ exec }: { exec: SqlExecutor }) {
  const blocks = useDbQuery<any>(exec, 'SELECT id, name, tree_count, nominal_drip_flow_lph FROM blocks WHERE deleted_at IS NULL ORDER BY name');
  const [blockId, setBlockId] = useState<string>();
  const [lease, setLease] = useState<Lease>();
  const [frame, setFrame] = useState<string>();
  const [err, setErr] = useState<string>();
  const svc = useMemo(() => createValveService(exec, (l) => setLease((cur) => (!cur || cur.id === l.id ? l : cur))), [exec]);
  useEffect(() => () => svc.stop(), [svc]);
  const block = blocks.rows.find((b) => b.id === (blockId ?? blocks.rows[0]?.id));

  const issue = async (kind: 'DRIP' | 'VENTURI') => {
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

  return (
    <ScrollView style={s.screen}>
      <Text style={s.h1}>Điều khiển van (lease có hạn)</Text>
      <Text style={s.muted}>Không có lệnh "bật van" vô thời hạn: mọi lệnh bị chặn bởi thời gian, thể tích và áp suất 2,0–3,5 bar.</Text>
      <View style={[s.row, { marginVertical: 8 }]}>
        {blocks.rows.map((b) => <Btn key={b.id} title={b.name} color={b.id === block?.id ? colors.green : '#546e7a'} onPress={() => setBlockId(b.id)} />)}
      </View>
      <View style={s.row}>
        <Btn title="Tưới nhỏ giọt 10 phút / 200 L" testID="issue-drip" onPress={() => issue('DRIP')} disabled={!block} />
        <Btn title="Châm phân Venturi 2,5 bar" testID="issue-venturi" onPress={() => issue('VENTURI')} disabled={!block} color="#00695c" />
      </View>
      {err && <Text style={{ color: colors.red }}>{err}</Text>}
      {lease && (
        <View style={[s.card, { marginTop: 10 }]}>
          <Text testID="lease-status" style={{ fontWeight: '800', color: lease.status === 'ACTIVE' ? colors.green : lease.status.startsWith('ABORTED') ? colors.red : colors.ink }}>{lease.status}</Text>
          <Text>Thể tích {lease.actualVolumeLiters.toFixed(1)} / {lease.maxVolumeLiters.toFixed(0)} L · áp TB {lease.averagePressureBar?.toFixed(2) ?? '—'} bar</Text>
          <Text style={s.muted}>Khung gửi phần cứng (CRC32):</Text>
          <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{frame}</Text>
          {lease.status === 'ACTIVE' && <Btn title="Dừng ngay" onPress={() => svc.runner.abort(lease.id)} color={colors.red} />}
        </View>
      )}
      <Text style={[s.muted, { marginTop: 12 }]}>Cổng phần cứng hiện là bộ mô phỏng; BLE thật cần mạch ESP32 (xem UNVERIFIED.md).</Text>
    </ScrollView>
  );
}
