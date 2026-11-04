// UUIDv7: 48-bit unix ms | ver 7 | 12-bit counter | var 10 | 62 random bits.
// The counter keeps ids strictly increasing inside one process even within the same millisecond.
let lastMs = -1;
let counter = 0;

export function generateUuidV7(nowMs: number = Date.now()): string {
  let ms = Math.max(nowMs, lastMs);
  if (ms === lastMs) {
    counter += 1;
    if (counter > 0xfff) { ms += 1; counter = 0; } // counter overflow: borrow the next ms
  } else {
    counter = 0;
  }
  lastMs = ms;

  const rnd = new Uint8Array(8);
  globalThis.crypto.getRandomValues(rnd);
  const hex = (n: number, w: number) => n.toString(16).padStart(w, '0');
  const tail = Array.from(rnd, (b) => hex(b, 2)).join('');
  const var16 = hex(0x8000 | (parseInt(tail.slice(0, 4), 16) & 0x3fff), 4);
  const msHex = hex(ms, 12);
  return `${msHex.slice(0, 8)}-${msHex.slice(8)}-7${hex(counter, 3)}-${var16}-${tail.slice(4, 16)}`;
}
