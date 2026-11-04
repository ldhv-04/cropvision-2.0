import { handshakeSchema, pullResponseSchema, pushResponseSchema, type SyncTransport } from '@cropvision/sync-protocol';

export interface TransportDeps {
  /** Local file for a sample's WebP. */
  mediaUri(sampleId: string): string | Promise<string>;
  /** Stream the file as a raw binary PUT (never Base64): expo-file-system uploadAsync in the app, fetch in tests. */
  upload(url: string, fileUri: string): Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class HttpSyncTransport implements SyncTransport {
  constructor(private base: string, private d: TransportDeps) {}

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.d.timeoutMs ?? 15_000);
    try {
      const res = await (this.d.fetchImpl ?? fetch)(`${this.base}${path}`, { ...init, signal: ctl.signal });
      if (!res.ok) throw new Error(`hub ${path} → HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async handshake() { return handshakeSchema.parse(await this.json('/api/v1/handshake')); }
  async pull(since: number) { return pullResponseSchema.parse(await this.json(`/api/v1/sync/pull?since=${since}`)); }
  async push(body: Parameters<SyncTransport['push']>[0]) {
    return pushResponseSchema.parse(await this.json('/api/v1/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  }
  async putMedia(sampleId: string) {
    await this.d.upload(`${this.base}/api/v1/media/${encodeURIComponent(sampleId)}`, await this.d.mediaUri(sampleId));
  }
}
