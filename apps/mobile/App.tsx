import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { generateUuidV7 } from '@cropvision/domain';
import { ThemeProvider } from '@cropvision/theme-tokens/react';
import { getDb } from './src/db/client';
import type { SqlExecutor } from './src/db/sql-store';
import { Btn, LanBanner, useHmi } from './src/components/ui';
import { useLanStatus } from './src/services/lan-status';
import type { FieldFlow } from './src/lib/hmi';
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
  return <ThemeProvider initial="tactical-daylight"><Root /></ThemeProvider>;
}

function Root() {
  const { c, s } = useHmi();
  const [exec, setExec] = useState<SqlExecutor>();
  const [deviceId, setDeviceId] = useState('');
  const [fatal, setFatal] = useState<string>();
  useEffect(() => { getDb().then(async (e) => { setDeviceId(await loadDeviceId(e)); setExec(e); }).catch((e) => setFatal(String(e))); }, []);
  if (fatal) return <View style={s.screen}><Text style={{ color: c.danger, fontWeight: '700' }}>Không mở được CSDL: {fatal}</Text></View>;
  if (!exec) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={c.primary} /></View>;
  return <Field exec={exec} deviceId={deviceId} />;
}

function Field({ exec, deviceId }: { exec: SqlExecutor; deviceId: string }) {
  const { c, palette, setTheme } = useHmi();
  const [tab, setTab] = useState<Tab>('orders');
  const [scout, setScout] = useState<ScoutTarget | null>(null);
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  const lan = useLanStatus(exec, deviceId, bump);
  const glare = palette.id === 'high-noon-monochrome';

  if (scout) {
    return <GuidedScoutingScreen exec={exec} deviceId={deviceId} target={scout} onDone={() => { setScout(null); bump(); lan.refresh(); }} />;
  }
  const launch = (flow: FieldFlow, target: ScoutTarget) => (flow === 'scouting' ? setScout(target) : setTab(flow));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0 }}>
      <StatusBar style="dark" />
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 8, borderBottomWidth: 2, borderColor: c.border, backgroundColor: c.bg }}>
        <View style={{ flex: 1 }}><LanBanner reachable={lan.reachable} pendingSamples={lan.pending} busy={lan.busy} onPress={lan.syncNow} /></View>
        <Btn title={glare ? '☀ Thường' : '☀ Chói'} testID="glare-toggle" variant="outline" height={44}
          onPress={() => setTheme(glare ? 'tactical-daylight' : 'high-noon-monochrome')} />
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'orders' && <WorkOrderListScreen key={rev} exec={exec} onLaunch={launch} />}
        {tab === 'scan' && <ChemicalScannerScreen exec={exec} />}
        {tab === 'valve' && <LocalValveControlScreen exec={exec} />}
        {tab === 'sync' && <SyncScreen exec={exec} deviceId={deviceId} onSynced={() => { bump(); lan.refresh(); }} />}
      </View>
      {/* thumb zone: navigation at the bottom, 56px targets */}
      <View style={{ flexDirection: 'row', gap: 8, padding: 8, borderTopWidth: 2, borderColor: c.border, backgroundColor: c.card }}>
        {TABS.map(([t, label]) => <Btn key={t} testID={`tab-${t}`} title={label} onPress={() => setTab(t)} variant="outline" selected={t === tab} style={{ flex: 1 }} />)}
      </View>
    </SafeAreaView>
  );
}
