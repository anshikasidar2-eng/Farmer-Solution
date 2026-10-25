import { useEffect, useState } from 'react';
import { api } from './api';
import type { HistoryItem, Meta, Report } from './types';
import { Card, Msg, errText, type Note } from './ui';

export default function Home({ meta, version, onGo }: { meta: Meta; version: number; onGo: (t: string) => void }) {
  const [r, setR] = useState<Report | null>(null);
  const [hist, setHist] = useState<HistoryItem[]>([]);
  const [note, setNote] = useState<Note>(null);
  const [m, setM] = useState({ temp: '', humidity: '', rain: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    api.report().then((x) => {
      if (!live) return;
      setR(x);
      setM({ temp: x.weather.manual?.temp?.toString() ?? '', humidity: x.weather.manual?.humidity?.toString() ?? '', rain: x.weather.manual?.rain ?? '' });
    }).catch((e) => live && setNote({ text: errText(e), kind: 'err' }));
    api.history().then((h) => live && setHist(h)).catch(() => undefined);
    return () => { live = false; };
  }, [version, tick]);

  async function saveManual() {
    try { await api.manualWeather(m); setNote({ text: 'Weather details saved.', kind: 'ok' }); setTick((t) => t + 1); }
    catch (e) { setNote({ text: errText(e), kind: 'err' }); }
  }
  async function refreshNasa() {
    setNote({ text: 'Fetching NASA POWER data...', kind: 'warn' });
    try { const w = await api.weather(true); setNote(w.nasaError ? { text: w.nasaError, kind: 'err' } : { text: 'Weather updated.', kind: 'ok' }); setTick((t) => t + 1); }
    catch (e) { setNote({ text: errText(e), kind: 'err' }); }
  }
  if (!r) return <><Msg note={note} /><p className="mu">Loading your farm report...</p></>;
  const p = r.profile, w = r.weather, y = r.yield, d = r.lastAnalysis;
  return (
    <>
      <Msg note={note} />
      <Card title={`Welcome, ${p.name}`}>
        <p>Location: {p.village}, {p.district}, {p.state} - {p.farmSize} {p.unit === 'ha' ? 'ha' : 'acres'} - Season now: <b>{meta.season}</b></p>
      </Card>
      <Card title="Weather">
        {w.nasa ? (
          <p>Average of the {w.nasa.period} near {w.nasa.place}: <b>{w.nasa.temp} C</b>, humidity <b>{w.nasa.humidity}%</b>, rain <b>{w.nasa.rain30} mm</b>.
            <span className="mu"> Source: {w.nasa.source}. Past data, not a forecast.{w.nasa.stale ? ' (older saved copy)' : ''}</span></p>
        ) : <div className="m warn">{w.nasaError || 'No weather data yet.'} You can enter values yourself below.</div>}
        <button className="b s" onClick={refreshNasa}>Refresh from NASA POWER</button>
        <div className="g">
          <div><label>Temperature (C), your entry</label><input type="number" value={m.temp} onChange={(e) => setM({ ...m, temp: e.target.value })} /></div>
          <div><label>Humidity (%), your entry</label><input type="number" value={m.humidity} onChange={(e) => setM({ ...m, humidity: e.target.value })} /></div>
          <div><label>Rain expected in 3 days</label>
            <select value={m.rain} onChange={(e) => setM({ ...m, rain: e.target.value })}>
              <option value="">Unknown</option><option value="no">No rain</option><option value="light">Light rain</option><option value="heavy">Heavy rain</option>
            </select></div>
        </div>
        <button className="b s" onClick={saveManual}>Save my weather entries</button>
      </Card>
      <Card title="Your farming report">
        <p>Selected crop: <b>{r.crop ? r.crop.name : 'none yet'}</b> {!r.crop && <button className="b s" onClick={() => onGo('crops')}>Choose a crop</button>}</p>
        {y && !y.unavailable && y.perHa && y.production && <p>Yield estimate: <b>{y.perHa.low}-{y.perHa.high} t/ha</b>, about <b>{y.production.low}-{y.production.high} tonnes</b> for your farm (estimate only).</p>}
        {y?.unavailable && <p className="mu">{y.message}</p>}
        {d && <p>Last photo check: <b>{d.clear ? `${d.plant} - ${d.condition}` : 'photo was unclear'}</b></p>}
      </Card>
      <Card title="History">
        {hist.length ? <ul>{hist.slice(0, 15).map((h, i) => <li key={i}>{h.createdAt.slice(0, 10)} - {h.summary}</li>)}</ul> : <p className="mu">Nothing yet.</p>}
      </Card>
    </>
  );
}
