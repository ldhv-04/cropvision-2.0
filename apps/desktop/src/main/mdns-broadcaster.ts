import { Bonjour } from 'bonjour-service';
import { MDNS_SERVICE_TYPE } from '@cropvision/sync-protocol';
import { HUB_VERSION } from './lan-server';

export interface Advertisement { stop(): Promise<void> }

/** Publishes `_cropvision-hub._tcp.local.` with TXT {version, farmName, hubId} (SPEC §4.1). */
export function advertiseHub(o: { port: number; farmName: string; hubId: string }): Advertisement {
  const bonjour = new Bonjour();
  bonjour.publish({
    name: `CropVision ${o.farmName}`, type: MDNS_SERVICE_TYPE, protocol: 'tcp', port: o.port,
    txt: { version: HUB_VERSION, farmName: o.farmName, hubId: o.hubId },
  });
  return {
    stop: () => new Promise<void>((done) => bonjour.unpublishAll(() => { bonjour.destroy(); done(); })),
  };
}
