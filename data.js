// Builds every dataset-driven table at start-up from the ORIGINAL CSV files in server/datasets/.
// Nothing here is pre-baked: change a CSV and restart to change the results.
import fs from 'node:fs';

const read = (f) => {
  const lines = fs.readFileSync(new URL(`../datasets/${f}`, import.meta.url), 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((l) => { const c = l.split(','), o = {}; head.forEach((h, i) => (o[h] = (c[i] ?? '').trim())); return o; });
};
const INFO = JSON.parse(fs.readFileSync(new URL('../data/crop-info.json', import.meta.url), 'utf8'));
export const nz = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const quant = (arr, p) => { const a = [...arr].sort((x, y) => x - y), i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo); };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const title = (s) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// ---------- Crop_recommendation.csv ----------
const REC = read('Crop_recommendation.csv').map((r) => ({ x: [r.N, r.P, r.K, r.temperature, r.humidity, r.ph, r.rainfall].map(Number), label: r.label }));
const byLabel = {};
REC.forEach((r) => (byLabel[r.label] ||= []).push(r.x));

// Gaussian Naive Bayes (same maths as scikit-learn's GaussianNB)
const allVar = [0, 1, 2, 3, 4, 5, 6].map((j) => { const c = REC.map((r) => r.x[j]), m = mean(c); return mean(c.map((v) => (v - m) ** 2)); });
const eps = 1e-9 * Math.max(...allVar);
const classes = Object.keys(byLabel).sort();
export const ML = {
  c: classes,
  pr: classes.map((k) => byLabel[k].length / REC.length),
  mu: classes.map((k) => [0, 1, 2, 3, 4, 5, 6].map((j) => mean(byLabel[k].map((x) => x[j])))),
  var: classes.map((k, i) => [0, 1, 2, 3, 4, 5, 6].map((j) => mean(byLabel[k].map((x) => (x[j] - mean(byLabel[k].map((y) => y[j]))) ** 2)) + eps)),
};

// ---------- Fertilizer_20Prediction.csv ----------
// The file has every row twice and Excel turned "10-26-26" into a date; both are repaired here.
const seen = new Set();
export const FT = [];
for (const r of read('Fertilizer_20Prediction.csv')) {
  const label = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r['Fertilizer Name']) ? '10-26-26' : r['Fertilizer Name'];
  const row = [Number(r.Nitrogen), Number(r.Phosphorous), Number(r.Potassium), label];
  const key = [r.Temparature, r.Humidity, r.Moisture, r['Soil Type'], r['Crop Type'], ...row].join('|');
  if (!seen.has(key)) { seen.add(key); FT.push(row); }
}

// ---------- crop_production.csv ----------
const PROD = read('crop_production.csv').map((r) => ({ st: r.State_Name, di: r.District_Name, yr: Number(r.Crop_Year), se: r.Season, cr: r.Crop, a: Number(r.Area), p: Number(r.Production) }))
  .filter((r) => r.a > 0 && r.p > 0);
const byCrop = new Map();
PROD.forEach((r) => { if (!byCrop.has(r.cr)) byCrop.set(r.cr, []); byCrop.get(r.cr).push(r); });
const rowsFor = (names) => names.flatMap((n) => byCrop.get(n) || []);

export const GEO = {
  states: [...new Set(read('crop_production.csv').map((r) => r.State_Name))].sort(),
  districts: [...new Set(read('crop_production.csv').map((r) => title(r.District_Name)))].sort(),
};

const SM = { Kharif: 'Kharif', Autumn: 'Kharif', Rabi: 'Rabi', Winter: 'Rabi', Summer: 'Zaid' };
function seasonsOf(rows) {
  const o = {};
  rows.forEach((r) => { const s = SM[r.se]; if (s) o[s] = (o[s] || 0) + 1 / rows.length; });
  return ['Kharif', 'Rabi', 'Zaid'].filter((s) => (o[s] || 0) >= 0.15);
}

export const CROPS = {}, YT = {};
for (const [k, i] of Object.entries(INFO)) {
  const g = byLabel[k] ? REC.filter((r) => r.label === k).map((r) => r.x) : null;
  const col = (j) => g.map((x) => x[j]);
  const c = { n: i.n, soil: i.soil, d: i.d, f: i.f };
  if (i.per) c.per = 1;
  if (i.ml) c.ml = 1;
  // pH, water need and growing conditions from Crop_recommendation.csv when the crop is in it
  c.ph = i.ph ?? [r1(quant(col(5), 0.05)), r1(quant(col(5), 0.95))];
  c.w = i.w ?? (mean(col(6)) < 80 ? 1 : mean(col(6)) < 150 ? 2 : 3);
  c.t = i.t ?? `Dataset conditions: ${[3, 4, 6].map((j) => `${Math.round(quant(col(j), 0.05))}-${Math.round(quant(col(j), 0.95))}`).join(' / ')} (temperature C / humidity % / rainfall mm)`;
  // season from production records
  const all = rowsFor(i.names);
  c.s = i.s ?? ((all.length >= 50 && seasonsOf(all).length) ? seasonsOf(all) : i.sFallback ?? ['Kharif']);
  // yield from production records (2005 onward)
  const rows = rowsFor(i.names).filter((r) => r.yr >= 2005);
  if (!i.noYield && rows.length >= 50) {
    const mul = i.mul ?? 1, y = rows.map((r) => ({ ...r, y: (r.p / r.a) * mul }));
    c.y = [r2(quant(y.map((r) => r.y), 0.25)), r2(quant(y.map((r) => r.y), 0.75))];
    const t = {};
    const groups = (arr, f) => { const m = new Map(); arr.forEach((r) => { const key = nz(f(r)); if (!m.has(key)) m.set(key, []); m.get(key).push(r.y); }); return m; };
    for (const [st, v] of groups(y, (r) => r.st)) if (v.length >= 10) t[st] = { _: [...[0.25, 0.5, 0.75].map((p) => r2(quant(v, p))), v.length] };
    const perState = new Map();
    y.forEach((r) => { const key = nz(r.st); if (!perState.has(key)) perState.set(key, []); perState.get(key).push(r); });
    for (const [st, arr] of perState) if (t[st]) for (const [d, v] of groups(arr, (r) => r.di)) if (v.length >= 5) t[st][d] = [...[0.25, 0.5, 0.75].map((p) => r2(quant(v, p))), v.length];
    YT[k] = t;
  } else c.y = i.y ?? null;
  CROPS[k] = c;
}
