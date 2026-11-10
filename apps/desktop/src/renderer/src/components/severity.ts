export const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString('vi-VN') : '—');
export const toMs = (isoDate: string) => (isoDate ? new Date(isoDate + 'T00:00:00').getTime() : null);
export const fmtPct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}%`);
export const fmtVnd = (v: number) => `${v.toLocaleString('vi-VN')} ₫`;
export const ipcError = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
