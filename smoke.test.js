import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const free = () => new Promise((r) => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

async function start(env) {
  const port = await free();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-'));
  const child = spawn(process.execPath, ['--no-warnings', 'start.js'], {
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir, JWT_SECRET: 'test-secret-test-secret', ...env }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  const call = async (method, url, body, token, raw) => {
    const r = await fetch(base + url, { method, headers: { ...(raw ? { 'content-type': 'image/png' } : body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ? raw : body ? JSON.stringify(body) : undefined });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  return { call, stop: () => child.kill() };
}
const PROFILE = { name: 'Asha', state: 'Uttar Pradesh', district: 'Lucknow', village: 'Malihabad', farmSize: 2, unit: 'acre', soil: 'loam', irrigation: 'canal' };

test('full farmer workflow without disease provider', async (t) => {
  const s = await start({});
  t.after(s.stop);
  const { call } = s;
  assert.equal((await call('POST', '/api/auth/signup', { email: 'bad', password: 'longenough1' })).status, 400);
  assert.equal((await call('POST', '/api/auth/signup', { email: 'a@b.com', password: 'short' })).status, 400);
  const su = await call('POST', '/api/auth/signup', { email: 'a@b.com', password: 'longenough1' });
  assert.equal(su.status, 201);
  assert.equal((await call('POST', '/api/auth/signup', { email: 'a@b.com', password: 'longenough1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { email: 'a@b.com', password: 'wrongpass1' })).status, 401);
  const token = (await call('POST', '/api/auth/login', { email: 'a@b.com', password: 'longenough1' })).body.token;
  assert.equal((await call('GET', '/api/me')).status, 401);

  assert.equal((await call('GET', '/api/recommendations', null, token)).status, 409); // profile first
  assert.equal((await call('PUT', '/api/profile', { ...PROFILE, village: '' }, token)).status, 400);
  assert.equal((await call('PUT', '/api/profile', { ...PROFILE, ph: 12 }, token)).status, 400);
  assert.equal((await call('PUT', '/api/profile', PROFILE, token)).status, 200);
  const me = await call('GET', '/api/me', null, token);
  assert.equal(me.body.profile.village, 'Malihabad'); // saved permanently

  const rec = await call('GET', '/api/recommendations', null, token);
  assert.equal(rec.body.crops.length, 5);
  assert.ok(rec.body.crops[0].reasons.length > 0);
  assert.equal((await call('GET', '/api/yield', null, token)).status, 409); // no crop yet

  assert.equal((await call('PUT', '/api/crop', { crop: 'nope' }, token)).status, 400);
  await call('PUT', '/api/crop', { crop: 'wheat' }, token);
  const y = await call('GET', '/api/yield', null, token);
  assert.equal(y.body.districtBased, true);
  assert.ok(y.body.perHa.low > 0 && y.body.production.high >= y.body.production.low);
  assert.match(y.body.note, /estimate/i);

  const c1 = await call('GET', '/api/care', null, token);
  assert.equal(c1.body.fertilizer.preliminary, true); // no soil test entered
  await call('PUT', '/api/weather/manual', { temp: 38, humidity: 85, rain: 'heavy' }, token);
  const c2 = await call('GET', '/api/care', null, token);
  assert.ok(c2.body.weatherPrecautions.some((x) => /Heavy rain/.test(x)));
  assert.ok(c2.body.weatherPrecautions.some((x) => /Hot weather/.test(x)));

  const w = await call('GET', '/api/weather', null, token); // sandbox has no internet: must not invent data
  assert.equal(w.status, 200);
  if (w.body.nasaError) assert.equal(w.body.nasa, null);

  const m = await call('POST', '/api/model/crop', { n: 90, p: 42, k: 43, temperature: 20.9, humidity: 82, ph: 6.5, rainfall: 203 }, token);
  assert.equal(m.body.top[0].crop, 'rice');
  assert.equal((await call('POST', '/api/model/crop', { n: 90 }, token)).status, 400);
  const f = await call('POST', '/api/fertilizer/match', { n: 37, p: 0, k: 0 }, token);
  assert.equal(f.body.product, 'Urea');

  const d = await call('POST', '/api/disease', null, token, PNG); // not configured -> honest error, no fake result
  assert.equal(d.status, 503);
  assert.ok(d.body.setup.length > 0);
  assert.equal((await call('POST', '/api/disease', null, token, Buffer.from('not an image at all'))).status, 400);

  const rep = await call('GET', '/api/report', null, token);
  assert.equal(rep.body.crop.key, 'wheat');
  assert.ok(rep.body.yield && rep.body.care);
  assert.ok((await call('GET', '/api/history', null, token)).body.length >= 4);

  // changing the crop updates dependent results
  await call('PUT', '/api/crop', { crop: 'banana' }, token);
  const fb = await call('GET', '/api/care', null, token);
  assert.equal(fb.body.fertilizer.available, false);
});

test('photo analysis through the Anthropic API (stand-in server), saved and access-controlled', async (t) => {
  let seen = null, unclear = false;
  const fake = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen = JSON.parse(Buffer.concat(chunks).toString());
      const out = unclear ? { clear: false, message: 'Too blurry to judge.' }
        : { clear: true, plant: 'Tomato', condition: 'Possible early blight', confidence: 'medium', symptoms: ['Brown ring spots'], causes: ['Fungus'], treatment: ['Remove infected leaves'], prevention: ['Rotate crops'], nutrients: '', care: '', expert: '' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }] }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  t.after(() => fake.close());
  const s = await start({ ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${fake.address().port}` });
  t.after(s.stop);
  const { call } = s;
  const tok = async (e) => (await call('POST', '/api/auth/signup', { email: e, password: 'longenough1' })).body.token;
  const a = await tok('one@x.com'), b = await tok('two@x.com');
  await call('PUT', '/api/profile', PROFILE, a);
  assert.equal((await call('POST', '/api/disease', null, a, PNG)).status, 409); // crop first
  await call('PUT', '/api/crop', { crop: 'tomato' }, a);
  const r = await call('POST', '/api/disease', null, a, PNG);
  assert.equal(r.status, 201);
  assert.equal(r.body.plant, 'Tomato');
  assert.ok(r.body.warnings.length > 0); // says it is not a trained classifier
  const sent = JSON.stringify(seen);
  assert.ok(sent.includes('"type":"image"') && sent.includes('Malihabad') && sent.includes('Tomato')); // photo + saved location and crop reach the analysis
  unclear = true;
  const u = await call('POST', '/api/disease', null, a, PNG);
  assert.equal(u.body.clear, false); // unclear photo is reported, not guessed
  assert.equal((await call('GET', `/api/analyses/${r.body.id}/image`, null, a)).status, 200);
  assert.equal((await call('GET', `/api/analyses/${r.body.id}/image`, null, b)).status, 404); // other user blocked
  assert.equal((await call('GET', '/api/analyses', null, a)).body.length, 2);
});
