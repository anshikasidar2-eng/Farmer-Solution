import fs from 'node:fs';
import { CROPS, YT, FT, ML, GEO } from './data.js';
export { CROPS, GEO };

const nz = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const fx = (n) => (n < 10 ? +n.toFixed(1) : Math.round(n));

export function season(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 6 && m <= 9 ? 'Kharif' : m >= 3 && m <= 5 ? 'Zaid' : 'Rabi';
}
export const areaHa = (p) => (p.unit === 'acre' ? p.farm_size * 0.4047 : p.farm_size);

// ---------- Crop recommendation (rules from profile) ----------
function score(k, p) {
  const c = CROPS[k], reasons = [];
  let s = 0;
  if (c.s.includes(season())) { s += 40; reasons.push(`Sown in the current ${season()} season`); }
  else reasons.push(`Normally sown in ${c.s.join('/')}, not the current season`);
  if (p.soil && p.soil !== 'unknown') {
    if (c.soil.includes(p.soil)) { s += 25; reasons.push(`Suits ${p.soil} soil`); }
    else reasons.push(`Not an ideal match for ${p.soil} soil`);
  } else { s += 12; reasons.push('Soil type not given, so soil match is unknown'); }
  if (p.ph != null) {
    if (p.ph >= c.ph[0] && p.ph <= c.ph[1]) { s += 15; reasons.push(`Your soil pH ${p.ph} is in range`); }
    else reasons.push(`Your soil pH ${p.ph} is outside the usual ${c.ph.join('-')} range`);
  } else s += 7;
  if (c.w === 3 && p.irrigation === 'rainfed') reasons.push('Needs a lot of water; risky on rain-only land');
  else if (c.w === 1 || p.irrigation !== 'rainfed') { s += 20; reasons.push(c.w === 1 ? 'Low water need' : 'Your irrigation can support it'); }
  else { s += 10; reasons.push('Medium water need on rain-only land; depends on rainfall'); }
  return { crop: k, name: c.n, score: s, reasons, sowing: c.per ? 'Perennial, planted in most seasons' : c.s.join(' / '),
    duration: c.d, conditions: c.t, typicalYield: c.y };
}
// Climate-dependent crops (fruit, coffee, coconut) are only suggested by the AI crop model.
export const recommend = (p, n = 5) =>
  Object.keys(CROPS).filter((k) => !CROPS[k].ml).map((k) => score(k, p)).sort((a, b) => b.score - a.score).slice(0, n);

// ---------- AI crop model (Gaussian Naive Bayes trained on Crop_recommendation.csv) ----------
export function cropModel(x) {
  const L = ML.c.map((_, i) => {
    let s = Math.log(ML.pr[i]);
    for (let j = 0; j < 7; j++) {
      const v = ML.var[i][j] + 1e-6;
      s += -0.5 * Math.log(2 * Math.PI * v) - (x[j] - ML.mu[i][j]) ** 2 / (2 * v);
    }
    return s;
  });
  const m = Math.max(...L), e = L.map((v) => Math.exp(v - m)), t = e.reduce((a, b) => a + b);
  const top = ML.c.map((c, i) => ({ crop: c, score: e[i] / t, i })).sort((a, b) => b.score - a.score).slice(0, 3);
  const b = top[0].i;
  const unusual = x.some((v, j) => Math.abs(v - ML.mu[b][j]) / Math.sqrt(ML.var[b][j] + 1e-6) > 3);
  return { top: top.map(({ crop, score }) => ({ crop, name: CROPS[crop]?.n ?? crop, score: +score.toFixed(4), hasCareData: !!CROPS[crop] })), unusual };
}

// ---------- Fertilizer product finder (k-nearest examples on N, P, K) ----------
export function fertilizerMatch(n, p, k) {
  const r = FT.map((e) => ({ l: e[3], d: Math.hypot(e[0] - n, e[1] - p, e[2] - k) })).sort((a, b) => a.d - b.d).slice(0, 3);
  const votes = {};
  r.forEach((e) => (votes[e.l] = (votes[e.l] || 0) + 1));
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  return { product: best, distance: +r[0].d.toFixed(1), farFromExamples: r[0].d > 8 };
}

// ---------- Yield estimate ----------
function lookupYield(k, p) {
  const t = YT[k]; if (!t) return null;
  const st = t[nz(p.state)]; if (!st) return null;
  const d = st[nz(p.district)];
  if (d) return { v: d, where: `your district (${p.district})` };
  return st._ ? { v: st._, where: `your state (${p.state}), because your district was not found` } : null;
}
export function yieldEstimate(k, p) {
  const c = CROPS[k]; if (!c) return null;
  const hit = lookupYield(k, p);
  if (!c.y && !hit) return null;
  const factors = []; let m = 1;
  if (!c.s.includes(season())) { m *= 0.8; factors.push('Not the usual season (may lower yield)'); }
  if (p.soil !== 'unknown' && !c.soil.includes(p.soil)) { m *= 0.9; factors.push('Soil type not ideal (may lower yield)'); }
  if (p.ph != null && (p.ph < c.ph[0] || p.ph > c.ph[1])) { m *= 0.9; factors.push('Soil pH outside the ideal range (may lower yield)'); }
  if (p.irrigation === 'rainfed' && c.w >= 2) { m *= 0.88; factors.push('Rain-only farm with a water-hungry crop (may lower yield)'); }
  if (p.irrigation === 'drip') { m *= 1.05; factors.push('Drip irrigation (may raise yield)'); }
  let lo, md, hi, source;
  if (hit) {
    [lo, md, hi] = hit.v;
    source = `Government crop-production records 2005-2015 for ${hit.where}, ${hit.v[3]} records; range is the 25th to 75th percentile. Not adjusted for your soil or season.`;
  } else {
    lo = c.y[0] * m * 0.85; hi = c.y[1] * m; md = (c.y[0] + c.y[1]) / 2 * m;
    source = 'No district or state record found. All-India typical range from government records, adjusted for season, soil, pH and irrigation.';
  }
  const a = areaHa(p);
  return { crop: k, name: c.n, unit: 'tonnes per hectare', perHa: { low: fx(lo), mid: fx(md), high: fx(hi) },
    areaHa: +a.toFixed(2), production: { low: fx(lo * a), mid: fx(md * a), high: fx(hi * a), unit: 'tonnes' },
    districtBased: !!hit, source, factors,
    improve: ['Get a soil test and apply balanced fertilizer', 'Use certified seed of a variety suited to your area',
      'Irrigate at critical growth stages and control weeds early', 'Scout weekly for pests and disease'],
    note: 'This is an estimate, not a guarantee. Records end in 2015 and do not use this season\'s weather.' };
}

// ---------- Fertilizer, irrigation and weather care ----------
const lvl = (x) => (x === 'low' ? 'raise the dose by about 20-25%' : x === 'high' ? 'reduce the dose or skip it' : 'use the standard dose');
export function care(k, p, w) {
  const c = CROPS[k]; if (!c) return null;
  const levels = [p.n_level, p.p_level, p.k_level];
  const names = ['Nitrogen (N)', 'Phosphorus (P2O5)', 'Potassium (K2O)'];
  const hasSoilTest = levels.some(Boolean);
  const fert = c.f ? {
    available: true, preliminary: !hasSoilTest,
    message: hasSoilTest ? 'Doses adjusted for the soil-test levels you entered.' : 'No soil-test values entered, so these are preliminary general doses. Get a soil test for accurate dosing.',
    rows: c.f.map((kg, i) => ({ nutrient: names[i], kgPerHa: kg, kgPerAcre: +(kg * 0.4047).toFixed(1), note: levels[i] ? lvl(levels[i]) : '' })),
    guidance: 'General doses; actual need depends on soil test, variety and local advice. Common sources: urea (N), DAP or SSP (P), MOP (K); add farmyard manure if available. Apply nitrogen in 2-3 splits.',
  } : { available: false, preliminary: true, message: 'No fertilizer dose data for this crop yet. Use your soil-test report and local advice; the product finder can match N-P-K amounts.', rows: [], guidance: '' };
  const irrigation = [c.w === 3 ? 'High water need: keep the field flooded or very moist through most growth stages.'
    : c.w === 2 ? 'Medium water need: irrigate every 7-12 days, more often at flowering and grain or fruit filling.'
    : 'Low water need: 1-3 light irrigations; avoid waterlogging.'];
  if (p.irrigation === 'rainfed') irrigation.push('Rain-only farm: use mulch, sow with the first good rain, and keep a rescue irrigation if possible.');
  if (p.irrigation === 'drip') irrigation.push('Drip: small, frequent watering saves water.');
  const pre = [];
  if (w?.rain === 'heavy') pre.push('Heavy rain expected: delay fertilizer and spraying, and clear drains.');
  else if (w?.rain === 'light') pre.push('Light rain expected: you may skip the next irrigation.');
  else if (w?.rain === 'no') pre.push('No rain expected: follow the normal irrigation schedule.');
  if (w?.temp >= 35) pre.push('Hot weather (35 C or more): irrigate early morning or evening.');
  if (w?.temp != null && w.temp <= 8) pre.push('Cold weather: protect seedlings from frost.');
  if (w?.humidity >= 80) pre.push('High humidity: watch for fungal disease.');
  if (!pre.length) pre.push('No weather available; add it on the Home tab for tailored precautions.');
  return { crop: k, name: c.n, fertilizer: fert, irrigation, weatherPrecautions: pre };
}
