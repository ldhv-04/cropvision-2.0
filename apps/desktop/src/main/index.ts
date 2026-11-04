import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateUuidV7 } from '@cropvision/domain';
import { HUB_PORT } from '@cropvision/sync-protocol';
import { openDb } from './db';
import { createHub, safeMediaPath } from './lan-server';
import { advertiseHub } from './mdns-broadcaster';
import { createHandlers } from './ipc-handlers';
import { LeaseManager } from './lease-manager';
import { SimulatedIrrigationController } from '@cropvision/domain';
import { API_METHODS } from '../shared/api';

// Must run before app is ready: lets the renderer fetch() with Range requests (PMTiles) and stream images.
protocol.registerSchemesAsPrivileged([{ scheme: 'cv-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

interface Settings { hubId: string; farmName: string; tilesPath?: string }

function loadSettings(file: string): Settings {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const s: Settings = { hubId: generateUuidV7(), farmName: 'Trang trại CropVision' };
  writeFileSync(file, JSON.stringify(s, null, 2));
  return s;
}

const lanAddresses = () => Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n!.address);

async function main() {
  await app.whenReady();
  const userData = app.getPath('userData');
  const mediaDir = join(userData, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const settingsFile = join(userData, 'settings.json');
  const settings = loadSettings(settingsFile);

  const ctx = openDb(join(userData, 'cropvision.sqlite'));
  const controller = new SimulatedIrrigationController(); // swap for a USB-serial LoRa / MQTT IIrrigationController here
  const leases = new LeaseManager(ctx.db, controller);
  await leases.recoverAfterRestart();
  leases.start();

  const hub = await createHub({ ...ctx, mediaDir, hubId: settings.hubId, farmName: settings.farmName });
  let mdnsOn = false;
  try { await hub.listen(HUB_PORT, '0.0.0.0'); } catch (e) { console.error('LAN hub failed to start', e); }
  const adv = advertiseHub({ port: HUB_PORT, farmName: settings.farmName, hubId: settings.hubId });
  mdnsOn = true;

  const handlers = createHandlers({
    db: ctx.db, leases,
    hubInfo: () => ({ port: HUB_PORT, hubId: settings.hubId, farmName: settings.farmName, addresses: lanAddresses(), mdns: mdnsOn }),
  });
  const shell = {
    chooseTiles: async () => {
      const r = await dialog.showOpenDialog({ title: 'Chọn bản đồ ngoại tuyến (.pmtiles)', filters: [{ name: 'PMTiles', extensions: ['pmtiles'] }], properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return false;
      settings.tilesPath = r.filePaths[0];
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
      return true;
    },
    hasTiles: async () => !!settings.tilesPath && existsSync(settings.tilesPath),
  };
  const all: Record<string, (...a: any[]) => unknown> = { ...handlers, ...shell };
  for (const m of API_METHODS) ipcMain.handle(`cv:${m}`, (_e, ...args) => all[m]!(...args));

  // cv-media://media/<key> and cv-media://tiles/basemap.pmtiles: files straight from disk, never Base64 over IPC.
  protocol.handle('cv-media', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = u.hostname === 'tiles' ? settings.tilesPath ?? null : u.hostname === 'media' ? safeMediaPath(mediaDir, rel) : null;
    if (!file || !existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers }); // forwards Range for PMTiles
  });

  const win = new BrowserWindow({
    width: 1400, height: 900, title: 'CropVision 2.0',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await win.loadFile(join(__dirname, '../renderer/index.html'));

  app.on('window-all-closed', async () => {
    leases.stop();
    await Promise.allSettled([adv.stop(), hub.close()]);
    ctx.sqlite.close();
    app.quit();
  });
}

main().catch((e) => { console.error(e); app.exit(1); });
