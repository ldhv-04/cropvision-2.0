import { contextBridge, ipcRenderer } from 'electron';
import { API_METHODS, type DesktopApi } from '../shared/api';

// Only these typed, named calls cross the bridge; the renderer never gets ipcRenderer itself.
const api = Object.fromEntries(
  API_METHODS.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(`cv:${m}`, ...args)]),
) as unknown as DesktopApi;

contextBridge.exposeInMainWorld('desktopApi', api);
contextBridge.exposeInMainWorld('cropvisionApi', api); // same object; name used by the Master Prompt (A4)
