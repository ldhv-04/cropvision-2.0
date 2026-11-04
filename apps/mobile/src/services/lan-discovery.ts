import Zeroconf from 'react-native-zeroconf';
import { MDNS_SERVICE_TYPE } from '@cropvision/sync-protocol';

export interface FoundHub { url: string; hubId: string; farmName: string }

/** Browse `_cropvision-hub._tcp.local.` and resolve the hub's IPv4 address (SPEC §4.1). Rejects after `timeoutMs`. */
export function discoverHub(timeoutMs = 10_000): Promise<FoundHub> {
  return new Promise((resolve, reject) => {
    const zc = new Zeroconf();
    const done = (fn: () => void) => { clearTimeout(timer); zc.stop(); zc.removeAllListeners(); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error('Không tìm thấy trạm CropVision trên Wi-Fi này'))), timeoutMs);
    zc.on('resolved', (s: any) => {
      const ip = (s.addresses as string[] | undefined)?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      if (!ip) return;
      done(() => resolve({ url: `http://${ip}:${s.port}`, hubId: s.txt?.hubId ?? '', farmName: s.txt?.farmName ?? s.name }));
    });
    zc.on('error', (e: unknown) => done(() => reject(e instanceof Error ? e : new Error(String(e)))));
    zc.scan(MDNS_SERVICE_TYPE, 'tcp', 'local.');
  });
}
