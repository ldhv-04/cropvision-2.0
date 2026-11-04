// Same cut-offs as the rust decision matrix (BSI 5 / 15): green → amber → red.
export const severityColor = (pct: number) => (pct < 5 ? '#2e9e44' : pct < 15 ? '#e0a100' : '#c62828');
export const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString('vi-VN') : '—');
export const toMs = (isoDate: string) => (isoDate ? new Date(isoDate + 'T00:00:00').getTime() : null);
