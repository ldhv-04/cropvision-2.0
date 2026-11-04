import { useHub, useHubEvents } from './store/queries';
import { useUi, type Tab } from './store/ui';
import { MapView } from './features/gis-map/MapView';
import { ScoutingInspector } from './features/scouting/ScoutingInspector';
import { WorkOrders } from './features/work-orders/WorkOrders';
import { Irrigation } from './features/irrigation/Irrigation';

const TABS: [Tab, string][] = [['map', 'Bản đồ GIS'], ['scouting', 'Khảo sát'], ['orders', 'Việc & Vật tư'], ['irrigation', 'Tưới & Châm phân']];

export function App() {
  useHubEvents();
  const { tab, setTab } = useUi();
  const hub = useHub().data;
  return (
    <div className="app">
      <header>
        <strong>CropVision 2.0</strong>
        <nav>{TABS.map(([t, label]) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>)}</nav>
        <span className="hub" title={hub?.hubId}>
          {hub ? `Hub LAN :${hub.port} · ${hub.addresses.join(', ') || 'không có Wi-Fi'} · mDNS ${hub.mdns ? 'bật' : 'tắt'}` : '…'}
        </span>
      </header>
      <main>
        {/* the map stays mounted so its WebGL context survives tab switches */}
        <div style={{ display: tab === 'map' ? 'block' : 'none', height: '100%' }}><MapView /></div>
        {tab === 'scouting' && <ScoutingInspector />}
        {tab === 'orders' && <WorkOrders />}
        {tab === 'irrigation' && <Irrigation />}
      </main>
    </div>
  );
}
