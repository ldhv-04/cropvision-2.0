import { FlatList, Text, View } from 'react-native';
import { Btn, colors, s, useDbQuery } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';

export interface ScoutTarget { blockId: string; blockName: string; workOrderId: string | null }

export function WorkOrderListScreen({ exec, onStartScouting }: { exec: SqlExecutor; onStartScouting: (t: ScoutTarget) => void }) {
  const orders = useDbQuery<any>(exec, `SELECT w.id, w.title, w.order_type, w.status, w.scheduled_date, w.block_id, b.name AS block_name
    FROM work_orders w LEFT JOIN blocks b ON b.id = w.block_id WHERE w.deleted_at IS NULL AND w.status IN ('OPEN','IN_PROGRESS') ORDER BY w.scheduled_date`);
  const blocks = useDbQuery<any>(exec, 'SELECT id, name FROM blocks WHERE deleted_at IS NULL ORDER BY name');
  const pending = useDbQuery<any>(exec, "SELECT (SELECT count(*) FROM leaf_samples WHERE sync_status='PENDING') AS samples, (SELECT count(*) FROM scouting_sessions WHERE sync_status='PENDING') AS sessions");
  return (
    <View style={s.screen}>
      <Text style={s.h1}>Việc hôm nay</Text>
      <Text style={s.muted}>Chờ đồng bộ: {pending.rows[0]?.sessions ?? 0} phiên · {pending.rows[0]?.samples ?? 0} mẫu</Text>
      <FlatList data={orders.rows} keyExtractor={(o) => o.id} ListEmptyComponent={<Text style={s.muted}>Chưa có lệnh. Vào tab Đồng bộ khi ở gần máy tính trạm.</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{item.title}</Text>
            <Text style={s.muted}>{item.block_name} · {item.order_type} · {new Date(item.scheduled_date).toLocaleDateString('vi-VN')}</Text>
            {item.order_type === 'SCOUTING' && <Btn title="Bắt đầu khảo sát" testID={`start-${item.id}`} onPress={() => onStartScouting({ blockId: item.block_id, blockName: item.block_name, workOrderId: item.id })} />}
          </View>
        )} />
      <Text style={[s.h1, { marginTop: 8 }]}>Khảo sát tự do</Text>
      <View style={s.row}>
        {blocks.rows.map((b) => <Btn key={b.id} title={b.name} color="#37474f" onPress={() => onStartScouting({ blockId: b.id, blockName: b.name, workOrderId: null })} />)}
      </View>
    </View>
  );
}
