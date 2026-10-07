// Kiểm tra dung lượng bản build (gzip) theo size-budget.json. Chạy sau `vite build`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'dist';
const budget = JSON.parse(readFileSync('size-budget.json', 'utf8'));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = new Set([...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]));

const kb = (bytes) => bytes / 1024;
const rows = [];
let failed = false;
let initialTotal = 0;

for (const file of readdirSync(join(dist, 'assets'))) {
  if (!/\.(js|css)$/.test(file)) continue;
  const gz = kb(gzipSync(readFileSync(join(dist, 'assets', file))).length);
  const name = file.replace(/-[\w-]{8}\.(js|css)$/, '');
  const path = `assets/${file}`;
  let limit;
  if (file.endsWith('.css')) limit = budget.css;
  else if (budget.chunks[name] !== undefined) limit = budget.chunks[name];
  else if (!initial.has(path)) limit = budget.lazyChunk;
  else limit = budget.chunks.index;
  if (file.endsWith('.js') && initial.has(path)) initialTotal += gz;
  const ok = gz <= limit;
  failed ||= !ok;
  rows.push(
    `${ok ? '✓' : '✗'} ${file.padEnd(36)} ${gz.toFixed(1).padStart(7)} KB / ${limit} KB${initial.has(path) ? ' (initial)' : ''}`,
  );
}

const initialOk = initialTotal <= budget.initialJs;
failed ||= !initialOk;
rows.push(
  `${initialOk ? '✓' : '✗'} ${'initial JS total'.padEnd(36)} ${initialTotal.toFixed(1).padStart(7)} KB / ${budget.initialJs} KB`,
);
console.log(rows.join('\n'));
if (failed) {
  console.error('\nVượt ngân sách dung lượng (size-budget.json).');
  process.exit(1);
}
