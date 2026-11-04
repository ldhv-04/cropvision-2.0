import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const api = () => window.desktopApi;
export const useBlocks = () => useQuery({ queryKey: ['blocks'], queryFn: () => api().listBlocks() });
export const useCheckpoints = (blockId: string | null) =>
  useQuery({ queryKey: ['checkpoints', blockId], queryFn: () => api().listCheckpoints(blockId!), enabled: !!blockId });
export const useWorkOrders = () => useQuery({ queryKey: ['workOrders'], queryFn: () => api().listWorkOrders() });
export const useSessions = () => useQuery({ queryKey: ['sessions'], queryFn: () => api().listSessions() });
export const useSamples = (sessionId: string | null) =>
  useQuery({ queryKey: ['samples', sessionId], queryFn: () => api().listSamples(sessionId!), enabled: !!sessionId });
export const useLogs = () => useQuery({ queryKey: ['logs'], queryFn: () => api().listLogs() });
export const usePhi = () => useQuery({ queryKey: ['phi'], queryFn: () => api().phiStatus() });
export const useCosts = () => useQuery({ queryKey: ['costs'], queryFn: () => api().costSummary() });
export const useLeases = () => useQuery({ queryKey: ['leases'], queryFn: () => api().listLeases(), refetchInterval: 1000 });
export const useHub = () => useQuery({ queryKey: ['hub'], queryFn: () => api().hubInfo() });

/** Hub WebSocket: SESSION_UPDATED makes sessions/samples refresh without a reload (SPEC phase 2). */
export function useHubEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    let ws: WebSocket | undefined, timer: ReturnType<typeof setTimeout>, closed = false;
    const connect = () => {
      ws = new WebSocket('ws://127.0.0.1:45678/ws');
      ws.onmessage = (m) => {
        const e = JSON.parse(String(m.data));
        if (e.type === 'SESSION_UPDATED') for (const k of ['sessions', 'samples', 'logs', 'phi', 'costs', 'leases', 'workOrders', 'blocks']) void qc.invalidateQueries({ queryKey: [k] });
      };
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 2000); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [qc]);
}
