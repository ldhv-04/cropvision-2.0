import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { generateUuidV7 } from '@cropvision/domain';
import { getDb } from './src/db/client';
import type { SqlExecutor } from './src/db/sql-store';
import { Btn, colors, s } from './src/components/ui';
import { WorkOrderListScreen, type ScoutTarget } from './src/screens/WorkOrderListScreen';
import { GuidedScoutingScreen } from './src/screens/GuidedScoutingScreen';
import { ChemicalScannerScreen } from './src/screens/ChemicalScannerScreen';
import { LocalValveControlScreen } from './src/screens/LocalValveControlScreen';
import { SyncScreen } from './src/screens/SyncScreen';

type Tab = 'orders' | 'scan' | 'valve' | 'sync';
const TABS: [Tab, string][] = [['orders', 'Việc'], ['scan', 'Thuốc'], ['valve', 'Van'], ['sync', 'Đồng bộ']];

async function loadDeviceId(exec: SqlExecutor) {
  const r = await exec.all<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'deviceId'");
  if (r[0]) return r[0].value;
  const id = generateUuidV7();
  await exec.run("INSERT INTO sync_meta (key, value) VALUES ('deviceId', ?)", [id]);
  return id;
}

export default function App() {
  const [exec, setExec] = useState<SqlExecutor>();
  const [deviceId, setDeviceId] = useState('');
  const [tab, setTab] = useState<Tab>('orders');
  const [scout, setScout] = useState<ScoutTarget | null>(null);
  const [rev, setRev] = useState(0);
  const [fatal, setFatal] = useState<string>();

  useEffect(() => { getDb().then(async (e) => { setDeviceId(await loadDeviceId(e)); setExec(e); }).catch((e) => setFatal(String(e))); }, []);
  if (fatal) return <View style={s.screen}><Text style={{ color: colors.red }}>Không mở được CSDL: {fatal}</Text></View>;
  if (!exec) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator /></View>;

  if (scout) {
    return <GuidedScoutingScreen exec={exec} deviceId={deviceId} target={scout} onDone={() => { setScout(null); setRev((r) => r + 1); }} />;
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0 }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'orders' && <WorkOrderListScreen key={rev} exec={exec} onStartScouting={setScout} />}
        {tab === 'scan' && <ChemicalScannerScreen exec={exec} />}
        {tab === 'valve' && <LocalValveControlScreen exec={exec} />}
        {tab === 'sync' && <SyncScreen exec={exec} deviceId={deviceId} onSynced={() => setRev((r) => r + 1)} />}
      </View>
      <View style={[s.row, { padding: 8, backgroundColor: '#fff', justifyContent: 'space-around' }]}>
        {TABS.map(([t, label]) => <Btn key={t} testID={`tab-${t}`} title={label} onPress={() => setTab(t)} color={t === tab ? colors.green : '#78909c'} style={{ flex: 1 }} />)}
      </View>
    </SafeAreaView>
  );
}
