import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
// Bundled worker (worker + shared chunk in one file) so it loads offline from the app's own files.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocks, useCheckpoints, useSamples, useSessions } from '../../store/queries';
import { useUi } from '../../store/ui';
import { severityColor, toMs } from '../../components/severity';

let pmtilesRegistered = false;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;
type Pt = [number, number];

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const drawing = useRef(false);
  const [ready, setReady] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [form, setForm] = useState<{ name: string; cropVariety: 'ROBUSTA' | 'ARABICA'; treeCount: number; harvest: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
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
        container: el.current, center: [108.0, 12.67], zoom: 10, // Đắk Lắk coffee belt; overwritten by fitBounds when blocks exist
        style: {
          version: 8,
          sources: hasTiles ? { base: { type: 'raster', url: 'pmtiles://cv-media://tiles/basemap.pmtiles', tileSize: 256 } } : {},
          layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe8d8' } }, ...(hasTiles ? [{ id: 'base', type: 'raster' as const, source: 'base' }] : [])],
        },
      });
      m.addControl(new maplibregl.NavigationControl(), 'bottom-right');
      m.on('load', () => {
        for (const id of ['blocks', 'checkpoints', 'samples', 'draft']) m.addSource(id, { type: 'geojson', data: EMPTY as any });
        m.addLayer({ id: 'blocks-fill', type: 'fill', source: 'blocks', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 } });
        m.addLayer({ id: 'blocks-line', type: 'line', source: 'blocks', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
        m.addLayer({ id: 'checkpoints', type: 'circle', source: 'checkpoints', paint: { 'circle-radius': 6, 'circle-color': '#1565c0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        m.addLayer({ id: 'samples', type: 'circle', source: 'samples', paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#6a1b9a', 'line-width': 2, 'line-dasharray': [2, 1] } });
        m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#6a1b9a' } });
        setReady(true);
      });
      m.on('click', (e) => {
        if (drawing.current) { setDraft((d) => [...d, [e.lngLat.lng, e.lngLat.lat]]); return; }
        const hit = m.queryRenderedFeatures(e.point, { layers: ['samples'] })[0];
        if (hit) { popup(m, e.lngLat, hit.properties as any); return; }
        const b = m.queryRenderedFeatures(e.point, { layers: ['blocks-fill'] })[0];
        useUi.getState().selectBlock((b?.properties?.id as string) ?? null);
      });
      map.current = m;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = undefined; };
  }, []);

  const set = (id: string, features: unknown[]) => (map.current?.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as any);

  useEffect(() => {
    if (!ready) return;
    const latest = new Map<string, number>();
    for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) latest.set(s.blockId, s.blockSeverityIndexPct);
    set('blocks', blocks.map((b) => ({
      type: 'Feature', geometry: JSON.parse(b.boundaryGeoJson),
      properties: { id: b.id, name: b.name, color: b.id === selectedBlockId ? '#1565c0' : latest.has(b.id) ? severityColor(latest.get(b.id)!) : '#607d8b' },
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
      properties: { id: s.id, ds: s.dsIndexPct, layer: s.canopyLayer, url: s.mediaUrl ?? '', color: severityColor(s.dsIndexPct) },
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
    } catch (e) { setError((e as Error).message); }
  };
  const route = async (n: number) => {
    if (!selectedBlockId) return;
    await window.desktopApi.generateCheckpoints(selectedBlockId, n);
    await qc.invalidateQueries({ queryKey: ['checkpoints'] });
  };
  const selected = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div ref={el} className="mapbox" data-testid="map" />
      <div className="tools">
        {!isDrawing && !form && <button className="act" onClick={startDraw}>✏️ Vẽ lô mới</button>}
        {isDrawing && <><button className="act" onClick={finish}>Hoàn tất ({draft.length} đỉnh)</button><button className="act" onClick={stopDraw}>Hủy</button></>}
        {selected && <><span>Lô: <b>{selected.name}</b> · {selected.areaHectares.toFixed(2)} ha · {selected.treeCount} cây</span>
          <button className="act" onClick={() => route(5)}>Tuyến Z 5 điểm</button><button className="act" onClick={() => route(10)}>Tuyến Z 10 điểm</button>
          <button className="act" onClick={async () => { await window.desktopApi.deleteBlock(selected.id); selectBlock(null); await qc.invalidateQueries({ queryKey: ['blocks'] }); }}>Xóa lô</button></>}
        <button className="act" onClick={async () => { if (await window.desktopApi.chooseTiles()) location.reload(); }}>🗺️ Bản đồ ngoại tuyến…</button>
        {error && <span className="err">{error}</span>}
      </div>
      {form && (
        <div className="modal">
          <div className="row">
            <label>Tên lô<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Giống<select value={form.cropVariety} onChange={(e) => setForm({ ...form, cropVariety: e.target.value as any })}><option>ROBUSTA</option><option>ARABICA</option></select></label>
            <label>Số cây<input type="number" value={form.treeCount} onChange={(e) => setForm({ ...form, treeCount: +e.target.value })} /></label>
            <label>Dự kiến thu hoạch<input type="date" value={form.harvest} onChange={(e) => setForm({ ...form, harvest: e.target.value })} /></label>
          </div>
          <button className="act" onClick={save} disabled={!form.name}>Lưu lô</button> <button className="act" onClick={stopDraw}>Hủy</button>
          {error && <div className="err">{error}</div>}
        </div>
      )}
    </div>
  );
}

// Built with DOM nodes (not innerHTML) so sample data can never inject markup.
function popup(m: maplibregl.Map, at: maplibregl.LngLat, p: { ds: number; layer: string; url: string }) {
  const box = document.createElement('div');
  const t = document.createElement('div');
  t.textContent = `DS ${Number(p.ds).toFixed(1)}% · tầng ${p.layer}`;
  box.append(t);
  if (p.url) { const img = document.createElement('img'); img.src = p.url; img.width = 180; box.append(img); }
  new maplibregl.Popup().setLngLat(at).setDOMContent(box).addTo(m);
}
