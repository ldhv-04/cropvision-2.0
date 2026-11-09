import { FlatList, Text, View } from 'react-native';
import { readableOn } from '@cropvision/theme-tokens';
import { Btn, useDbQuery, useHmi } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';
import { launchTarget, orderStripe, orderSummary, type FieldFlow } from '../lib/hmi';

export interface ScoutTarget { blockId: string; blockName: string; workOrderId: string | null }

const LAUNCH_LABEL: Record<FieldFlow, string> = { scouting: 'BẮT ĐẦU KHẢO SÁT', scan: 'QUÉT THUỐC TRƯỚC KHI PHUN', valve: 'MỞ ĐIỀU KHIỂN VAN' };

export function WorkOrderListScreen({ exec, onLaunch }: { exec: SqlExecutor; onLaunch: (flow: FieldFlow, t: ScoutTarget) => void }) {
  const { c, s, palette } = useHmi();
  const orders = useDbQuery<any>(exec, `SELECT w.id, w.title, w.order_type, w.status, w.scheduled_date, w.block_id, w.instructions_json, b.name AS block_name
    FROM work_orders w LEFT JOIN blocks b ON b.id = w.block_id WHERE w.deleted_at IS NULL AND w.status IN ('OPEN','IN_PROGRESS') ORDER BY w.scheduled_date`);
  const blocks = useDbQuery<any>(exec, 'SELECT id, name FROM blocks WHERE deleted_at IS NULL ORDER BY name');
  const cps = useDbQuery<{ block_id: string; n: number }>(exec, 'SELECT block_id, count(*) AS n FROM scouting_checkpoints WHERE deleted_at IS NULL GROUP BY block_id');
  const cpCount = new Map(cps.rows.map((r) => [r.block_id, r.n]));

  return (
    <View style={s.screen}>
      <FlatList data={orders.rows} keyExtractor={(o) => o.id} contentContainerStyle={{ paddingBottom: 8 }}
        ListHeaderComponent={<Text style={s.h1}>Việc hôm nay</Text>}
        ListEmptyComponent={<Text style={s.muted}>Chưa có lệnh. Vào tab Đồng bộ khi ở gần máy tính trạm.</Text>}
        renderItem={({ item }) => {
          const stripe = orderStripe(palette, item.order_type);
          const flow = launchTarget(item.order_type);
          const target = { blockId: item.block_id, blockName: item.block_name, workOrderId: item.id };
          return (
            <View style={{ flexDirection: 'row', marginBottom: 12, borderRadius: 8, borderWidth: 2, borderColor: c.border, backgroundColor: c.card, overflow: 'hidden' }}>
              <View style={{ width: 8, backgroundColor: stripe }} />
              <View style={{ flex: 1, padding: 12, gap: 8 }}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: c.ink, flexShrink: 1 }}>{item.block_name ?? '—'}</Text>
                  <View style={{ minHeight: 32, paddingHorizontal: 10, borderRadius: 6, justifyContent: 'center', backgroundColor: stripe }}>
                    <Text style={{ color: readableOn(stripe), fontSize: 12, fontWeight: '700' }}>{item.order_type}</Text>
                  </View>
                </View>
                <Text style={[s.text, { fontWeight: '600' }]}>{orderSummary(item, cpCount.get(item.block_id) ?? 0)}</Text>
                <Text style={s.muted}>{item.title} · {new Date(item.scheduled_date).toLocaleDateString('vi-VN')}</Text>
                {flow && <Btn title={LAUNCH_LABEL[flow]} testID={flow === 'scouting' ? `start-${item.id}` : `launch-${item.id}`} onPress={() => onLaunch(flow, target)} />}
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={[s.h1, { fontSize: 16 }]}>Khảo sát tự do</Text>
            <View style={s.row}>
              {blocks.rows.map((b) => <Btn key={b.id} title={b.name} variant="outline" onPress={() => onLaunch('scouting', { blockId: b.id, blockName: b.name, workOrderId: null })} />)}
            </View>
          </View>
        } />
    </View>
  );
}
