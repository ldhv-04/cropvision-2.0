import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
// Bundled worker (worker + shared chunk in one file) so it loads offline from the app's own files.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useQueryClient } from '@tanstack/react-query';
import { MousePointer2, PenLine, Route, Trash2 } from 'lucide-react';
import { SEVERITY_BANDS, SEVERITY_CRITICAL_PCT, SEVERITY_WARNING_PCT, type Palette } from '@cropvision/theme-tokens';
import { useTheme } from '@cropvision/theme-tokens/react';
import { useBlocks, useCheckpoints, useSamples, useSessions } from '../../store/queries';
import { useUi } from '../../store/ui';
import { ipcError, toMs } from '../../components/severity';
import { Button } from '../../components/ui/button';
import { Field, Input, NativeSelect } from '../../components/ui/input';
import { cn } from '../../lib/utils';

let pmtilesRegistered = false;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;
type Pt = [number, number];
const LAYERS = { bsi: ['blocks-fill', 'blocks-line'], checkpoints: ['checkpoints'], samples: ['samples', 'sample-clusters'] } as const;
type LayerKey = keyof typeof LAYERS;

/** Severity → telemetry fill, as a MapLibre expression over a numeric property (WebGL, no DOM markers). */
const tone = (p: Palette, value: ExpressionSpecification): ExpressionSpecification =>
  ['step', value, p.telemetry['healthy-fill'], SEVERITY_WARNING_PCT, p.telemetry['warning-fill'], SEVERITY_CRITICAL_PCT, p.telemetry['critical-fill']];

function paint(m: maplibregl.Map, p: Palette) {
  const bsi: ExpressionSpecification = ['case', ['<', ['get', 'bsi'], 0], p.shadcn['muted-foreground'], tone(p, ['get', 'bsi'])];
  m.setPaintProperty('bg', 'background-color', p.shadcn.muted);
  m.setPaintProperty('blocks-fill', 'fill-color', bsi);
  m.setPaintProperty('blocks-line', 'line-color', ['case', ['get', 'selected'], p.shadcn.ring, bsi]);
  m.setPaintProperty('checkpoints', 'circle-color', p.telemetry['hydraulic-fill']);
  m.setPaintProperty('checkpoints', 'circle-stroke-color', p.shadcn.background);
  m.setPaintProperty('samples', 'circle-color', tone(p, ['get', 'ds']));
  m.setPaintProperty('samples', 'circle-stroke-color', p.shadcn.background);
  m.setPaintProperty('sample-clusters', 'circle-color', tone(p, ['get', 'maxDs']));
  m.setPaintProperty('sample-clusters', 'circle-stroke-color', p.shadcn.background);
  m.setPaintProperty('draft-line', 'line-color', p.shadcn.foreground);
  m.setPaintProperty('draft-pts', 'circle-color', p.shadcn.foreground);
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const drawing = useRef(false);
  const [ready, setReady] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [form, setForm] = useState<{ name: string; cropVariety: 'ROBUSTA' | 'ARABICA'; treeCount: number; harvest: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({ bsi: true, checkpoints: true, samples: true });
  const qc = useQueryClient();
  const { palette } = useTheme();
  const { selectedBlockId, selectedSessionId, selectBlock } = useUi();
  const blocks = useBlocks().data ?? [];
  const sessions = useSessions().data ?? [];
  const checkpoints = useCheckpoints(selectedBlockId).data ?? [];
  const samples = useSamples(selectedSessionId).data ?? [];

  useEffect(() => {
    if (!pmtilesRegistered) { maplibregl.setWorkerUrl(workerUrl); maplibregl.addProtocol('pmtiles', new Protocol().tile); pmtilesRegistered = true; }
    let cancelled = false;
    void (async () => {
      const hasTiles = await window.desktopApi.hasTiles();
      if (cancelled || !el.current) return;
      const m = new maplibregl.Map({
        container: el.current, center: [108.0, 12.67], zoom: 10, attributionControl: false, // Đắk Lắk coffee belt; overwritten by fitBounds when blocks exist
        style: {
          version: 8,
          sources: hasTiles ? { base: { type: 'raster', url: 'pmtiles://cv-media://tiles/basemap.pmtiles', tileSize: 256 } } : {},
          layers: [{ id: 'bg', type: 'background', paint: {} }, ...(hasTiles ? [{ id: 'base', type: 'raster' as const, source: 'base' }] : [])],
        },
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      m.on('load', () => {
        for (const id of ['blocks', 'checkpoints', 'draft']) m.addSource(id, { type: 'geojson', data: EMPTY as any });
        m.addSource('samples', { type: 'geojson', data: EMPTY as any, cluster: true, clusterRadius: 36, clusterMaxZoom: 17, clusterProperties: { maxDs: ['max', ['get', 'ds']] } });
        m.addLayer({ id: 'blocks-fill', type: 'fill', source: 'blocks', paint: { 'fill-opacity': 0.28 } });
        m.addLayer({ id: 'blocks-line', type: 'line', source: 'blocks', paint: { 'line-width': ['case', ['get', 'selected'], 3, 1.5] } });
        m.addLayer({ id: 'checkpoints', type: 'circle', source: 'checkpoints', paint: { 'circle-radius': 5, 'circle-stroke-width': 1.5 } });
        m.addLayer({ id: 'sample-clusters', type: 'circle', source: 'samples', filter: ['has', 'point_count'], paint: { 'circle-radius': ['step', ['get', 'point_count'], 10, 10, 14, 50, 18], 'circle-stroke-width': 2 } });
        m.addLayer({ id: 'samples', type: 'circle', source: 'samples', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 6, 'circle-stroke-width': 1.5 } });
        m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-width': 1.5, 'line-dasharray': [2, 1] } });
        m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 3.5 } });
        setReady(true);
      });
      m.on('click', (e) => {
        if (drawing.current) { setDraft((d) => [...d, [e.lngLat.lng, e.lngLat.lat]]); return; }
        const cluster = m.queryRenderedFeatures(e.point, { layers: ['sample-clusters'] })[0];
        if (cluster) {
          void (m.getSource('samples') as GeoJSONSource).getClusterExpansionZoom(cluster.properties!.cluster_id as number)
            .then((zoom) => m.easeTo({ center: (cluster.geometry as unknown as { coordinates: Pt }).coordinates, zoom, duration: 0 }));
          return;
        }
        const hit = m.queryRenderedFeatures(e.point, { layers: ['samples'] })[0];
        if (hit) { popup(m, e.lngLat, hit.properties as any); return; }
        const b = m.queryRenderedFeatures(e.point, { layers: ['blocks-fill'] })[0];
        useUi.getState().selectBlock((b?.properties?.id as string) ?? null);
      });
      map.current = m;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = undefined; };
  }, []);

  useEffect(() => { if (ready && map.current) paint(map.current, palette); }, [ready, palette]);

  useEffect(() => {
    if (!ready || !map.current) return;
    for (const k of Object.keys(LAYERS) as LayerKey[]) for (const id of LAYERS[k]) map.current.setLayoutProperty(id, 'visibility', visible[k] ? 'visible' : 'none');
  }, [ready, visible]);

  const set = (id: string, features: unknown[]) => (map.current?.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as any);

  useEffect(() => {
    if (!ready) return;
    const latest = new Map<string, number>();
    for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) latest.set(s.blockId, s.blockSeverityIndexPct);
    set('blocks', blocks.map((b) => ({
      type: 'Feature', geometry: JSON.parse(b.boundaryGeoJson),
      properties: { id: b.id, name: b.name, bsi: latest.get(b.id) ?? -1, selected: b.id === selectedBlockId },
    })));
  }, [ready, blocks, sessions, selectedBlockId]);

  useEffect(() => {
    if (!ready || blocks.length === 0 || !map.current) return;
    const b = new maplibregl.LngLatBounds();
    for (const blk of blocks) for (const p of JSON.parse(blk.boundaryGeoJson).coordinates[0]) b.extend(p);
    map.current.fitBounds(b, { padding: 60, duration: 0, maxZoom: 17 });
    // fit once when blocks first appear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, blocks.length > 0]);

  useEffect(() => {
    if (!ready) return;
    set('checkpoints', checkpoints.map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] }, properties: { n: c.sequenceOrder } })));
  }, [ready, checkpoints]);

  useEffect(() => {
    if (!ready) return;
    set('samples', samples.map((s) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id, ds: s.dsIndexPct, layer: s.canopyLayer, thumb: s.thumbUrl ?? '' },
    })));
  }, [ready, samples]);

  useEffect(() => {
    if (!ready) return;
    const f: unknown[] = draft.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
    if (draft.length > 1) f.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [...draft, draft[0]!] }, properties: {} });
    set('draft', f);
  }, [ready, draft]);

  const startDraw = () => { drawing.current = true; setIsDrawing(true); setDraft([]); setError(null); };
  const stopDraw = () => { drawing.current = false; setIsDrawing(false); setDraft([]); setForm(null); };
  const finish = () => {
    if (draft.length < 3) { setError('Cần ít nhất 3 đỉnh'); return; }
    drawing.current = false; setIsDrawing(false);
    setForm({ name: '', cropVariety: 'ROBUSTA', treeCount: 1000, harvest: '' });
  };
  const save = async () => {
    if (!form) return;
    try {
      const b = await window.desktopApi.saveBlock({
        name: form.name, cropVariety: form.cropVariety, growthStage: 'FRUIT_DEVELOPMENT', treeCount: form.treeCount,
        expectedHarvestDate: toMs(form.harvest), boundary: { type: 'Polygon', coordinates: [[...draft, draft[0]!]] },
      });
      stopDraw(); selectBlock(b.id);
      await qc.invalidateQueries({ queryKey: ['blocks'] });
    } catch (e) { setError(ipcError(e)); }
  };
  const route = async (n: number) => {
    if (!selectedBlockId) return;
    await window.desktopApi.generateCheckpoints(selectedBlockId, n);
    await qc.invalidateQueries({ queryKey: ['checkpoints'] });
  };
  const selected = blocks.find((b) => b.id === selectedBlockId);
  const strip = 'flex items-center gap-1 rounded-md border border-border bg-card/95 p-1';

  return (
    <div className="relative h-full">
      <div ref={el} className="absolute inset-0" data-testid="map" />

      <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        <div role="toolbar" aria-label="Công cụ CAD" className={strip}>
          <Button size="sm" variant={!isDrawing && !form ? 'secondary' : 'ghost'} onClick={stopDraw}><MousePointer2 />Chọn lô</Button>
          {!isDrawing && !form && <Button size="sm" variant="ghost" onClick={startDraw}><PenLine />Vẽ lô mới</Button>}
          {isDrawing && <><Button size="sm" onClick={finish}>Hoàn tất ({draft.length} đỉnh)</Button><Button size="sm" variant="ghost" onClick={stopDraw}>Hủy</Button></>}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button size="sm" variant="ghost" disabled={!selected} onClick={() => route(5)}><Route />Tuyến Z 5 điểm</Button>
          <Button size="sm" variant="ghost" disabled={!selected} onClick={() => route(10)}><Route />Tuyến Z 10 điểm</Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {([['bsi', 'BSI'], ['checkpoints', 'Điểm chốt'], ['samples', 'Mẫu lá']] as const).map(([k, label]) => (
            <Button key={k} size="sm" variant="ghost" aria-pressed={visible[k]} onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              className={cn(visible[k] ? 'text-foreground' : 'text-muted-foreground line-through')}>{label}</Button>
          ))}
        </div>
        {selected && (
          <div className={cn(strip, 'px-2 text-[13px]')}>
            <span>Lô: <b>{selected.name}</b> · <span className="telemetry">{selected.areaHectares.toFixed(2)} ha · {selected.treeCount} cây</span></span>
            <Button size="sm" variant="ghost" aria-label="Xóa lô" onClick={async () => { await window.desktopApi.deleteBlock(selected.id); selectBlock(null); await qc.invalidateQueries({ queryKey: ['blocks'] }); }}><Trash2 /></Button>
          </div>
        )}
        {error && !form && <p role="alert" className="rounded-md border border-telemetry-critical-border bg-telemetry-critical-bg px-2 py-1 text-telemetry-critical">{error}</p>}
        {form && (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-popover p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Tên lô"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Giống"><NativeSelect value={form.cropVariety} onChange={(e) => setForm({ ...form, cropVariety: e.target.value as any })}><option>ROBUSTA</option><option>ARABICA</option></NativeSelect></Field>
              <Field label="Số cây"><Input type="number" value={form.treeCount} onChange={(e) => setForm({ ...form, treeCount: +e.target.value })} className="w-24" /></Field>
              <Field label="Dự kiến thu hoạch"><Input type="date" value={form.harvest} onChange={(e) => setForm({ ...form, harvest: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2"><Button onClick={save} disabled={!form.name}>Lưu lô</Button><Button variant="ghost" onClick={stopDraw}>Hủy</Button></div>
            {error && <p role="alert" className="text-telemetry-critical">{error}</p>}
          </div>
        )}
      </div>

      <section aria-label="Chú giải BSI" className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-md border border-border bg-card/95 p-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Chỉ số nghiêm trọng lô</span>
        {SEVERITY_BANDS.map((b) => (
          <div key={b.tone} className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-sm" style={{ background: palette.telemetry[`${b.tone}-fill`] }} />
            <span className="telemetry w-28">{b.label}</span>
            <span className="telemetry text-[11px] text-muted-foreground">{b.code}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

// Built with DOM nodes (not innerHTML) so sample data can never inject markup. Popups show the 160px thumbnail only.
function popup(m: maplibregl.Map, at: maplibregl.LngLat, p: { ds: number; layer: string; thumb: string }) {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1 text-xs';
  const t = document.createElement('div');
  t.className = 'telemetry';
  t.textContent = `DS ${Number(p.ds).toFixed(1)}% · tầng ${p.layer}`;
  box.append(t);
  if (p.thumb) { const img = document.createElement('img'); img.src = p.thumb; img.width = 160; img.height = 160; img.alt = 'ảnh mẫu'; box.append(img); }
  new maplibregl.Popup({ closeButton: false }).setLngLat(at).setDOMContent(box).addTo(m);
}
