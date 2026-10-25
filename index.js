import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, addHistory } from './db.js';
import { hashPassword, checkPassword, signToken, verifyToken } from './auth.js';
import { CROPS, GEO, season, recommend, cropModel, fertilizerMatch, yieldEstimate, care } from './advice.js';
import { getWeather } from './weather.js';
import { analyzeImage, imageType, HttpError } from './disease.js';

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const send = (res, status, body, headers = {}) => {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};
async function readBody(req, limit) {
  const chunks = []; let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new HttpError(413, 'Request is too large.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
const readJson = async (req) => {
  const b = await readBody(req, 100_000);
  if (!b.length) return {};
  try { return JSON.parse(b.toString()); } catch { throw new HttpError(400, 'Invalid JSON.'); }
};
const hits = new Map();
function rateLimit(req, max = 20, windowMs = 15 * 60_000) {
  const ip = req.socket.remoteAddress + (config.prod ? (req.headers['x-forwarded-for'] || '') : '');
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  h.push(now); hits.set(ip, h);
  if (h.length > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
}
const str = (v, name, max = 80) => {
  const s = String(v ?? '').trim();
  if (!s) throw new HttpError(400, `${name} is required.`);
  if (s.length > max) throw new HttpError(400, `${name} is too long.`);
  return s;
};
const num = (v, name, min, max, optional = false) => {
  if (optional && (v === '' || v == null)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${name} must be a number from ${min} to ${max}.`);
  return n;
};
const oneOf = (v, list, name) => { if (!list.includes(v)) throw new HttpError(400, `${name} is not valid.`); return v; };
const level = (v) => (['low', 'medium', 'high'].includes(v) ? v : null);

const getProfile = (uid) => db.prepare('SELECT * FROM profiles WHERE user_id=?').get(uid);
const publicProfile = (p) => p && ({
  name: p.name, state: p.state, district: p.district, village: p.village, farmSize: p.farm_size, unit: p.unit, soil: p.soil,
  irrigation: p.irrigation, ph: p.ph, nLevel: p.n_level, pLevel: p.p_level, kLevel: p.k_level, crop: p.crop, place: p.place,
});
const need = (uid) => {
  const p = getProfile(uid);
  if (!p) throw new HttpError(409, 'Please complete your farm profile first.');
  return p;
};
const needCrop = (p) => {
  if (!p.crop || !CROPS[p.crop]) throw new HttpError(409, 'Please select a crop first.');
  return p.crop;
};

class Reply { constructor(status, body) { this.status = status; this.body = body; } }

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler, { auth = true } = {}) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler, auth });

route('POST', '/api/auth/signup', async (req) => {
  rateLimit(req);
  const b = await readJson(req);
  const email = str(b.email, 'Email', 120).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const pw = String(b.password || '');
  if (pw.length < 8 || pw.length > 200) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new HttpError(409, 'This email already has an account. Please log in.');
  const id = Number(db.prepare('INSERT INTO users (email, pw_hash) VALUES (?,?)').run(email, hashPassword(pw)).lastInsertRowid);
  return new Reply(201, { token: signToken(id), email });
}, { auth: false });

route('POST', '/api/auth/login', async (req) => {
  rateLimit(req);
  const b = await readJson(req);
  const u = db.prepare('SELECT id, pw_hash FROM users WHERE email=?').get(String(b.email || '').trim().toLowerCase());
  if (!u || !checkPassword(String(b.password || ''), u.pw_hash)) throw new HttpError(401, 'Wrong email or password.');
  return { token: signToken(u.id), email: String(b.email).trim().toLowerCase() };
}, { auth: false });

route('GET', '/api/meta', () => ({
  states: GEO.states, districts: GEO.districts, season: season(),
  crops: Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, { name: c.n, perennial: !!c.per, aiModelOnly: !!c.ml }])),
  diseaseProvider: config.diseaseProvider,
}), { auth: false });

route('GET', '/api/me', (req, res, uid) => {
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(uid);
  return { email: u.email, profile: publicProfile(getProfile(uid)) || null };
});

route('PUT', '/api/profile', async (req, res, uid) => {
  const b = await readJson(req);
  const old = getProfile(uid);
  const v = {
    name: str(b.name, 'Name'), state: str(b.state, 'State'), district: str(b.district, 'District'), village: str(b.village, 'Village'),
    size: num(b.farmSize, 'Farm size', 0.01, 100000), unit: oneOf(b.unit || 'acre', ['acre', 'ha'], 'Unit'),
    soil: oneOf(b.soil || 'unknown', ['unknown', 'loam', 'clay', 'sandy', 'black'], 'Soil type'),
    irrigation: oneOf(b.irrigation || 'rainfed', ['rainfed', 'canal', 'drip'], 'Irrigation'),
    ph: num(b.ph, 'Soil pH', 3, 10, true), n: level(b.nLevel), p: level(b.pLevel), k: level(b.kLevel),
  };
  const moved = !old || old.state !== v.state || old.district !== v.district || old.village !== v.village;
  db.prepare(`INSERT INTO profiles (user_id,name,state,district,village,farm_size,unit,soil,irrigation,ph,n_level,p_level,k_level)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,state=excluded.state,district=excluded.district,village=excluded.village,
    farm_size=excluded.farm_size,unit=excluded.unit,soil=excluded.soil,irrigation=excluded.irrigation,ph=excluded.ph,
    n_level=excluded.n_level,p_level=excluded.p_level,k_level=excluded.k_level,updated_at=datetime('now')`)
    .run(uid, v.name, v.state, v.district, v.village, v.size, v.unit, v.soil, v.irrigation, v.ph, v.n, v.p, v.k);
  if (moved) {
    db.prepare('UPDATE profiles SET lat=NULL, lon=NULL, place=NULL WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM weather_cache WHERE user_id=?').run(uid);
  }
  addHistory(uid, 'profile', `Profile saved: ${v.village}, ${v.district}, ${v.state}`);
  return { profile: publicProfile(getProfile(uid)) };
});

route('PUT', '/api/crop', async (req, res, uid) => {
  need(uid);
  const { crop } = await readJson(req);
  if (!CROPS[crop]) throw new HttpError(400, 'Unknown crop.');
  db.prepare('UPDATE profiles SET crop=? WHERE user_id=?').run(crop, uid);
  addHistory(uid, 'crop', `Selected crop: ${CROPS[crop].n}`);
  return { crop };
});

route('GET', '/api/weather', async (req, res, uid, url) => {
  const p = need(uid);
  return getWeather(uid, p, { refresh: url.searchParams.get('refresh') === '1' });
});

route('PUT', '/api/weather/manual', async (req, res, uid) => {
  need(uid);
  const b = await readJson(req);
  const temp = num(b.temp, 'Temperature', -20, 60, true), humidity = num(b.humidity, 'Humidity', 0, 100, true);
  const rain = b.rain ? oneOf(b.rain, ['no', 'light', 'heavy'], 'Rain expected') : null;
  db.prepare('INSERT OR REPLACE INTO manual_weather (user_id,temp,humidity,rain) VALUES (?,?,?,?)').run(uid, temp, humidity, rain);
  return { ok: true };
});

route('GET', '/api/recommendations', (req, res, uid) => {
  const p = need(uid);
  return { season: season(), disclaimer: 'Ranked from season, soil, pH and irrigation using typical crop data. Local rainfall and climate are not checked. Nothing is guaranteed.', crops: recommend(p) };
});

route('POST', '/api/model/crop', async (req, res, uid) => {
  need(uid);
  const b = await readJson(req);
  const keys = ['n', 'p', 'k', 'temperature', 'humidity', 'ph', 'rainfall'];
  const x = keys.map((k) => num(b[k], k, k === 'ph' ? 3 : 0, k === 'humidity' ? 100 : k === 'ph' ? 10 : 5000));
  const r = cropModel(x);
  addHistory(uid, 'model', `AI crop model: ${r.top[0].name}`);
  return { ...r, note: 'Trained on the Crop Recommendation dataset (about 99.5% on its own held-out rows). Real-farm accuracy will be lower; the score is model confidence, not a guarantee.' };
});

route('POST', '/api/fertilizer/match', async (req, res, uid) => {
  need(uid);
  const b = await readJson(req);
  const r = fertilizerMatch(num(b.n, 'N', 0, 100), num(b.p, 'P', 0, 100), num(b.k, 'K', 0, 100));
  addHistory(uid, 'fertilizer', `Fertilizer finder: ${r.product}`);
  return { ...r, note: 'Based on 99 distinct examples. Names like 14-35-14 are the percent of N-P-K in the bag. Check the dose with a local advisor.' };
});

route('GET', '/api/care', async (req, res, uid) => {
  const p = need(uid), crop = needCrop(p);
  const w = (await getWeather(uid, p)).effective;
  return care(crop, p, w);
});

route('GET', '/api/yield', (req, res, uid) => {
  const p = need(uid), crop = needCrop(p);
  const e = yieldEstimate(crop, p);
  return e || { crop, name: CROPS[crop].n, unavailable: true, message: 'No reliable yield records for this crop in the datasets added so far, so no estimate is shown.' };
});

route('POST', '/api/disease', async (req, res, uid) => {
  const p = need(uid);
  const crop = needCrop(p);
  const buf = await readBody(req, config.maxImageBytes);
  const t = imageType(buf);
  if (!t) throw new HttpError(400, 'Please upload one JPG, PNG or WebP photo (up to 8 MB).');
  const weather = (await getWeather(uid, p)).effective;
  const result = await analyzeImage(buf, t[0], { crop, village: p.village, district: p.district, state: p.state, season: season(), weather });
  const dir = path.join(config.dataDir, 'uploads', String(uid));
  fs.mkdirSync(dir, { recursive: true });
  const file = `${crypto.randomUUID()}.${t[1]}`;
  fs.writeFileSync(path.join(dir, file), buf);
  const id = Number(db.prepare('INSERT INTO analyses (user_id,image_path,crop,provider,result) VALUES (?,?,?,?,?)')
    .run(uid, path.join(String(uid), file), crop, result.provider, JSON.stringify(result)).lastInsertRowid);
  addHistory(uid, 'disease', `Photo check (${CROPS[crop].n}): ${result.clear ? `${result.plant} - ${result.condition}` : 'photo unclear'}`);
  return new Reply(201, { id, ...result });
});

route('GET', '/api/analyses', (req, res, uid) =>
  db.prepare('SELECT id, crop, provider, result, created_at FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 20').all(uid)
    .map((r) => ({ id: r.id, crop: r.crop, createdAt: r.created_at, ...JSON.parse(r.result) })));

route('GET', '/api/analyses/(\\d+)/image', (req, res, uid, url, m) => {
  const r = db.prepare('SELECT image_path FROM analyses WHERE id=? AND user_id=?').get(Number(m[1]), uid); // owner only
  if (!r) throw new HttpError(404, 'Not found.');
  const file = path.join(config.dataDir, 'uploads', r.image_path);
  res.writeHead(200, { 'content-type': MIME['.' + file.split('.').pop()] || 'image/jpeg', 'cache-control': 'private, max-age=3600' });
  fs.createReadStream(file).pipe(res);
  return null;
});

route('GET', '/api/history', (req, res, uid) =>
  db.prepare('SELECT kind, summary, created_at AS createdAt FROM history WHERE user_id=? ORDER BY id DESC LIMIT 30').all(uid));

route('GET', '/api/report', async (req, res, uid) => {
  const p = need(uid);
  const weather = await getWeather(uid, p);
  const crop = p.crop && CROPS[p.crop] ? p.crop : null;
  const last = db.prepare('SELECT id, result, created_at FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1').get(uid);
  return {
    profile: publicProfile(p), season: season(), weather,
    crop: crop && { key: crop, name: CROPS[crop].n },
    care: crop ? care(crop, p, weather.effective) : null,
    yield: crop ? yieldEstimate(crop, p) : null,
    lastAnalysis: last && { id: last.id, createdAt: last.created_at, ...JSON.parse(last.result) },
  };
});

// ---------- server ----------
function serveStatic(req, res, pathname) {
  if (!fs.existsSync(config.clientDist)) return send(res, 404, { error: 'Not found.' });
  let f = path.join(config.clientDist, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(config.clientDist)) return send(res, 403, { error: 'Forbidden.' });
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(config.clientDist, 'index.html'); // SPA fallback
  const ext = path.extname(f);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  fs.createReadStream(f).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  if (config.prod) res.setHeader('strict-transport-security', 'max-age=31536000');
  try {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      return serveStatic(req, res, url.pathname);
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m || r.method !== req.method) continue;
      let uid = null;
      if (r.auth) {
        uid = verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!uid || !db.prepare('SELECT 1 FROM users WHERE id=?').get(uid)) throw new HttpError(401, 'Please log in again.');
      }
      const out = await r.handler(req, res, uid, url, m);
      if (out === null) return;
      return out instanceof Reply ? send(res, out.status, out.body) : send(res, 200, out);
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (res.headersSent) return res.end();
    const status = e instanceof HttpError ? e.status : 500;
    send(res, status, { error: e instanceof HttpError ? e.message : 'Something went wrong on the server.', ...(e.extra || {}) });
  }
});
