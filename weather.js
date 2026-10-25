import { db } from './db.js';

const TTL = 6 * 3600 * 1000;
const nz = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'AgriSmart/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

async function geocode(p) {
  const q = async (name) =>
    (await get(`https://geocoding-api.open-meteo.com/v1/search?count=10&country_code=IN&language=en&name=${encodeURIComponent(name)}`)).results || [];
  let g = (await q(p.district)).filter((x) => nz(x.admin1) === nz(p.state));
  if (!g.length) g = (await q(p.village)).filter((x) => nz(x.admin1) === nz(p.state));
  if (!g.length) throw new Error('Location not found on the map. Check the spelling of district and state.');
  return { lat: g[0].latitude, lon: g[0].longitude, place: `${g[0].name}, ${g[0].admin1}` };
}

async function nasaLast30(lat, lon) {
  const f = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
  // NASA POWER daily data lags by a few days, so end 7 days ago.
  const j = await get(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=${f(Date.now() - 37 * 864e5)}&end=${f(Date.now() - 7 * 864e5)}&format=JSON`);
  const d = j.properties.parameter;
  const vals = (o) => Object.values(o).filter((x) => x > -900);
  const avg = (o) => { const v = vals(o); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const t = avg(d.T2M), h = avg(d.RH2M);
  if (Number.isNaN(t) || Number.isNaN(h)) throw new Error('NASA POWER returned no data for this location.');
  return { temp: +t.toFixed(1), humidity: Math.round(h), rain30: Math.round(vals(d.PRECTOTCORR).reduce((a, b) => a + b, 0)) };
}

/** Returns { nasa: {...}|null, nasaError?, manual: {...}|null, effective: {temp,humidity,rain} } - never invents values. */
export async function getWeather(userId, profile, { refresh = false } = {}) {
  const manual = db.prepare('SELECT temp, humidity, rain FROM manual_weather WHERE user_id=?').get(userId) || null;
  let nasa = null, nasaError;
  const row = db.prepare('SELECT payload, fetched_at FROM weather_cache WHERE user_id=?').get(userId);
  if (row && !refresh && Date.now() - row.fetched_at < TTL) nasa = JSON.parse(row.payload);
  else {
    try {
      let { lat, lon, place } = profile;
      if (lat == null || lon == null) {
        ({ lat, lon, place } = await geocode(profile));
        db.prepare('UPDATE profiles SET lat=?, lon=?, place=? WHERE user_id=?').run(lat, lon, place, userId);
      }
      nasa = { ...(await nasaLast30(lat, lon)), place, period: 'last 30 days (ending about a week ago)', source: 'NASA POWER' };
      db.prepare('INSERT OR REPLACE INTO weather_cache (user_id, payload, fetched_at) VALUES (?,?,?)').run(userId, JSON.stringify(nasa), Date.now());
    } catch (e) {
      nasaError = `Live weather is unavailable: ${e.message}`;
      if (row) nasa = { ...JSON.parse(row.payload), stale: true };
    }
  }
  const effective = {
    temp: manual?.temp ?? nasa?.temp ?? null,
    humidity: manual?.humidity ?? nasa?.humidity ?? null,
    rain: manual?.rain || null, // rain expected is always the farmer's own entry (no forecast source here)
  };
  return { nasa, nasaError, manual, effective };
}
