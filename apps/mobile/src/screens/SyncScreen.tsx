import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Btn, useDbQuery, useHmi } from '../components/ui';
import type { SqlExecutor } from '../db/sql-store';
import { syncWithHub } from '../services/sync-client';
import { discoverHub } from '../services/lan-discovery';
import { sampleMediaUri, uploadWebp } from '../services/media';

const getMeta = async (exec: SqlExecutor, key: string) => (await exec.all<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [key]))[0]?.value;
const setMeta = (exec: SqlExecutor, key: string, value: string) =>
  exec.run('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);

export function SyncScreen({ exec, deviceId, onSynced }: { exec: SqlExecutor; deviceId: string; onSynced: () => void }) {
  const { c, s } = useHmi();
  const [url, setUrl] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useDbQuery<any>(exec, "SELECT (SELECT count(*) FROM leaf_samples WHERE sync_status='PENDING') AS samples, (SELECT count(*) FROM scouting_sessions WHERE sync_status='PENDING') AS sessions", [], [busy]);
  useEffect(() => { void getMeta(exec, 'hubUrl').then((v) => v && setUrl(v)); }, [exec]);
  const say = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString('vi-VN')} ${m}`, ...l].slice(0, 30));

  const find = async () => {
    setBusy(true); say('Đang dò mDNS _cropvision-hub._tcp …');
    try { const h = await discoverHub(); setUrl(h.url); await setMeta(exec, 'hubUrl', h.url); say(`Thấy trạm "${h.farmName}" tại ${h.url}`); }
    catch (e) { say(`Lỗi dò: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true); const t0 = Date.now(); say(`Đồng bộ với ${url} …`);
    try {
      await setMeta(exec, 'hubUrl', url);
      const r = await syncWithHub(url, exec, { deviceId, mediaUri: (id) => sampleMediaUri(exec, id), upload: uploadWebp });
      say(`Xong ${Date.now() - t0} ms · kéo ${r.pulled} · đẩy ${r.pushed} · ảnh ${r.mediaUploaded}${r.mediaFailed.length ? ` · LỖI ảnh ${r.mediaFailed.length}` : ''}`);
      onSynced();
    } catch (e) { say(`Lỗi: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen}>
      <Text style={s.h1}>Đồng bộ với trạm</Text>
      <Text style={s.muted}>Chờ đồng bộ: {pending.rows[0]?.sessions ?? 0} phiên · {pending.rows[0]?.samples ?? 0} mẫu</Text>
      <TextInput testID="hub-url" style={[s.input, { marginVertical: 8 }]} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.1.100:45678" placeholderTextColor={c.muted} />
      <View style={s.row}>
        <Btn title="Tìm trạm (mDNS)" onPress={find} disabled={busy} variant="secondary" style={{ flex: 1 }} />
        <Btn title="Đồng bộ" testID="sync-now" onPress={sync} disabled={busy || !url} style={{ flex: 1 }} />
      </View>
      {log.map((l, i) => <Text key={i} style={[s.muted, { marginTop: 4 }]} testID={i === 0 ? 'sync-log-0' : undefined}>{l}</Text>)}
    </ScrollView>
  );
}
