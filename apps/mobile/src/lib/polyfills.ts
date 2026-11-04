// Hermes' TextDecoder only knows UTF-8, but `fast-png` builds `new TextDecoder('latin1')` at import time.
// Latin-1 is a 1:1 byte -> code point map, so a tiny shim is exact. Must be imported before any other module.
const Native = (globalThis as any).TextDecoder as (new (label?: string) => { decode(b?: ArrayBufferView | ArrayBuffer): string }) | undefined;
const LATIN1 = new Set(['latin1', 'iso-8859-1', 'ascii', 'us-ascii', 'windows-1252']);

class Latin1Decoder {
  readonly encoding = 'windows-1252';
  decode(input?: ArrayBufferView | ArrayBuffer): string {
    if (!input) return '';
    const u8 = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    let out = '';
    for (let i = 0; i < u8.length; i += 8192) out += String.fromCharCode(...u8.subarray(i, i + 8192));
    return out;
  }
}

if (Native) {
  const Utf = Native;
  (globalThis as any).TextDecoder = class {
    private readonly impl: { decode(b?: ArrayBufferView | ArrayBuffer): string };
    constructor(label = 'utf-8') { this.impl = LATIN1.has(String(label).toLowerCase()) ? new Latin1Decoder() : new Utf(label); }
    decode(input?: ArrayBufferView | ArrayBuffer) { return this.impl.decode(input); }
  };
}
