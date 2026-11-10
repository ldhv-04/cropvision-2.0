// Real Electron e2e (needs a display + `pnpm build` + `pnpm rebuild:electron`). Run: pnpm e2e
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import electronPath from 'electron';

const userData = mkdtempSync(join(tmpdir(), 'cv-e2e-'));
const app = await electron.launch({ executablePath: electronPath, args: ['--no-sandbox', `--user-data-dir=${userData}`, '.'], cwd: new URL('..', import.meta.url).pathname });
const page = await app.firstWindow();
const logs = [];
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
page.on('pageerror', (e) => logs.push(String(e)));
const pass = (m) => console.log('PASS', m);
const hub = 'http://127.0.0.1:45678';

try {
  await page.waitForSelector('[data-testid=map]');
  await page.getByText(/Hub LAN :45678/).waitFor();
  pass('window renders, hub status shown');

  // --- UI-03 shell: fixed viewport, 5-module rail, BSI legend, keyboard-first navigation
  const shell = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight - innerHeight, rail: document.querySelectorAll('[data-testid=rail] button').length,
    dock: document.querySelector('[data-testid=inspector]')?.getBoundingClientRect().width,
  }));
  assert.deepEqual(shell, { scroll: 0, rail: 5, dock: 400 });
  await page.getByText('BSI ≥ 15%').waitFor();
  await page.keyboard.press('Alt+4');
  await page.getByRole('heading', { name: 'Lệnh giao việc' }).waitFor();
  await page.keyboard.press('Alt+1');
  pass('shell: no page scroll, 5 rail modules, 400px inspector, legend, Alt+N switches module');

  // --- draw a block on the map with real mouse clicks (SPEC phase 2: polygon tool)
  await page.getByText('Vẽ lô mới').click();
  const box = await page.locator('[data-testid=map]').boundingBox();
  for (const [dx, dy] of [[-120, -80], [120, -80], [120, 80], [-120, 80]])
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await page.getByText(/Hoàn tất \(4 đỉnh\)/).click();
  await page.getByLabel('Tên lô').fill('Lô E2E');
  await page.getByLabel('Dự kiến thu hoạch').fill('2099-01-01');
  await page.getByText('Lưu lô').click();
  await page.getByText(/Lô: Lô E2E/).waitFor();
  pass('polygon drawn and block saved');

  await page.getByText('Tuyến Z 10 điểm').click();
  await page.waitForFunction(async () => (await window.desktopApi.listCheckpoints((await window.desktopApi.listBlocks())[0].id)).length === 10);
  pass('10 Z-transect checkpoints generated');

  const block = await page.evaluate(async () => (await window.desktopApi.listBlocks())[0]);

  // --- work order via UI
  await page.getByRole('button', { name: 'Việc & Vật tư' }).click();
  await page.locator('form').nth(0).locator('select').first().selectOption({ label: 'Lô E2E' });
  await page.getByLabel('Tiêu đề').fill('Khảo sát sáng');
  await page.getByText('Tạo lệnh').click();
  await page.getByRole('cell', { name: 'Khảo sát sáng' }).waitFor();
  pass('work order created');

  // --- PHI lock: pesticide with PHI beyond harvest date is refused with a red alert
  await page.locator('form').nth(1).locator('select').first().selectOption({ label: 'Lô E2E' });
  await page.getByLabel('Sản phẩm').fill('Fungicide demo');
  await page.getByLabel('PHI (ngày)').fill('99999');
  await page.getByText('Ghi nhật ký').click();
  await page.getByRole('alert').filter({ hasText: 'PHI_VIOLATION_BLOCKED' }).waitFor();
  pass('PHI violation shown as red alert');

  // --- irrigation lease via UI
  await page.getByRole('button', { name: 'Tưới & Châm phân' }).click();
  await page.locator('select').first().selectOption({ label: 'Lô E2E' });
  await page.getByText('Tính kế hoạch').click();
  await page.getByText(/C_FLUSH/).waitFor();
  await page.getByText(/Cấp lease châm phân/).click();
  await page.getByRole('cell', { name: 'ACTIVE' }).waitFor();
  await page.getByText('Dừng').click();
  await page.getByRole('cell', { name: 'EXPIRED' }).waitFor();
  pass('Venturi lease issued then stopped');

  // --- mobile-style push + media PUT against the REAL hub: UI must update via WebSocket, no reload
  const now = Date.now();
  const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
  const row = { createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'PENDING' };
  const session = { id: 'e2e-ss', blockId: block.id, workOrderId: null, deviceId: 'phone', startedAt: now, completedAt: now, totalSamples: 1, diseaseIncidencePct: 100, blockSeverityIndexPct: 12, recommendationCode: 'LOCALIZED_SPOT_SPRAY', recommendationSummary: 'demo', ...row };
  const sample = { id: 'e2e-s1', sessionId: 'e2e-ss', checkpointId: null, canopyLayer: 'LOW', latitude: 12.67, longitude: 108.0, imuStabilityScore: 0.2, leafPixelCount: 100, lesionPixelCount: 12, dsIndexPct: 12, uncertaintyEntropy: 0.5, inferenceLatencyMs: 3, engineVersion: 'hsv-1.0.0', imageRelativeKey: '2026-11/e2e-s1.webp', mediaSyncStatus: 'LOCAL_ONLY', capturedAt: now, ...row };
  await page.getByRole('button', { name: 'Khảo sát', exact: true }).click();
  const t0 = Date.now();
  let r = await fetch(`${hub}/api/v1/sync/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: 'phone', scoutingSessions: [session], leafSamples: [sample], agronomicLogs: [], workOrders: [], irrigationLeases: [] }) });
  assert.equal(r.status, 200);
  const ack = await r.json();
  assert.deepEqual(ack.missingMediaSampleIds, ['e2e-s1']);
  await page.getByRole('cell', { name: 'Lô E2E' }).first().click();
  r = await fetch(`${hub}/api/v1/media/e2e-s1`, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: WEBP });
  assert.equal(r.status, 200);
  const img = page.locator('img[alt="mẫu e2e-s1"]');
  await img.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => { const i = document.querySelector('img[alt="mẫu e2e-s1"]'); return i && i.complete && i.naturalWidth > 0; });
  console.log(`  push→image visible on desktop in ${Date.now() - t0} ms`);
  // memory rule: the list shows the 160px thumbnail, never the original
  assert.match(await img.getAttribute('src'), /^cv-media:\/\/thumb\/2026-11\/e2e-s1\.webp$/);
  assert.ok(await img.evaluate((i) => i.naturalWidth <= 160 && i.naturalHeight <= 160));
  pass('session + WebP appear live via WebSocket; list uses cv-media://thumb');

  await img.click();
  const full = page.locator('img[alt="ảnh gốc e2e-s1"]');
  await full.waitFor();
  assert.match(await full.getAttribute('src'), /^cv-media:\/\/media\/2026-11\/e2e-s1\.webp$/);
  await page.keyboard.press('Escape');
  pass('row click opens the inspector dialog with the full-resolution image');

  // --- Overview tab: rule-engine output for the block, issued to the phone as a work order
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await page.getByTestId('inspector').getByText('LOCALIZED_SPOT_SPRAY').waitFor();
  await page.getByRole('button', { name: /Giao lệnh cho điện thoại/ }).click();
  await page.waitForFunction(async () => (await window.desktopApi.listWorkOrders()).some((w) => w.orderType === 'SPRAYING'));
  pass('overview shows rule-engine code and issues a SPRAYING work order');

  // --- virtualization: 300 samples render only a window of rows
  const many = Array.from({ length: 300 }, (_, i) => ({ ...sample, id: `e2e-v${i}`, sessionId: 'e2e-big', dsIndexPct: i % 30, imageRelativeKey: `2026-11/v${i}.webp` }));
  r = await fetch(`${hub}/api/v1/sync/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: 'phone', scoutingSessions: [{ ...session, id: 'e2e-big', startedAt: now + 1, totalSamples: 300 }], leafSamples: many, agronomicLogs: [], workOrders: [], irrigationLeases: [] }) });
  assert.equal(r.status, 200);
  await page.getByRole('cell', { name: '300', exact: true }).click();
  await page.getByText('300 mẫu lá').waitFor();
  const rows = await page.locator('[data-testid=sample-row]').count();
  assert.ok(rows > 0 && rows < 40, `rendered ${rows} rows of 300`);
  pass(`300 samples virtualized (${rows} rows in DOM)`);

  // --- Ctrl+K command dialog jumps to a block on the map
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Tìm lô/).fill('Lô E2E');
  await page.keyboard.press('Enter');
  await page.getByText(/Lô: Lô E2E/).waitFor();
  pass('Ctrl+K command dialog selects a block and opens the map');

  // --- theme template inspector switches palettes at runtime
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.keyboard.press('Alt+5');
  await page.getByRole('button', { name: 'Dùng Tactical Daylight' }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('theme-tactical-daylight'));
  assert.equal(await bg(), 'rgb(250, 249, 245)');
  await page.getByRole('button', { name: 'Dùng Agri Command Dark' }).click();
  assert.equal(await bg(), 'rgb(11, 15, 23)');
  pass('theme inspector switches tactical-daylight ⇄ agri-command-dark');

  // --- no base64 images anywhere in the DOM
  assert.equal(await page.evaluate(() => [...document.images].filter((i) => i.src.startsWith('data:')).length), 0);
  pass('no data: URL images');

  // --- memory: sum PSS/RSS of the Electron process tree 8 s after startup
  await page.waitForTimeout(8000);
  const mainPid = app.process().pid;
  const kids = execSync(`pgrep -P ${mainPid} || true`).toString().split('\n').filter(Boolean);
  const all = [mainPid, ...kids, ...kids.flatMap((k) => execSync(`pgrep -P ${k} || true`).toString().split('\n').filter(Boolean))];
  const kb = all.reduce((s, p) => s + Number(execSync(`awk '/^Pss:/{s+=$2} END{print s+0}' /proc/${p}/smaps_rollup 2>/dev/null || echo 0`).toString()), 0);
  console.log(`  process tree PSS: ${(kb / 1024).toFixed(0)} MB across ${all.length} processes`);
  assert.deepEqual(logs.filter((l) => !/Autofill|GPU|dbus|libva|vaapi/i.test(l)), [], 'renderer console errors');
  pass('no renderer console errors');
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}
