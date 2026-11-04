// Startup memory (AC-18). Usage: node e2e/memory.mjs [extra electron args...]  — prints PSS per Electron process and the total.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import electronPath from 'electron';

const userData = mkdtempSync(join(tmpdir(), 'cv-mem-'));
const extra = process.argv.slice(2);
const app = await electron.launch({ executablePath: electronPath, args: ['--no-sandbox', `--user-data-dir=${userData}`, ...extra, '.'], cwd: new URL('..', import.meta.url).pathname });
const page = await app.firstWindow();
await page.waitForSelector('[data-testid=map]');
await page.waitForTimeout(6000);
const root = app.process().pid;
const tree = (p) => [p, ...execSync(`pgrep -P ${p} || true`).toString().split('\n').filter(Boolean).flatMap((k) => tree(k))];
let total = 0;
for (const pid of tree(root)) {
  const pss = Number(execSync(`awk '/^Pss:/{s+=$2} END{print s+0}' /proc/${pid}/smaps_rollup 2>/dev/null || echo 0`).toString()) / 1024;
  const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
  const type = cmd.find((a) => a.startsWith('--type='))?.slice(7) ?? 'browser(main)';
  total += pss;
  console.log(`${String(pid).padEnd(8)} ${type.padEnd(14)} ${pss.toFixed(0).padStart(5)} MB`);
}
console.log(`TOTAL PSS ${total.toFixed(0)} MB`);
await app.close();
rmSync(userData, { recursive: true, force: true });
