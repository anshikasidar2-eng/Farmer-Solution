import { useEffect, useState } from 'react';
import { api } from './api';
import type { CropRec, ModelResult } from './types';
import { Card, List, Msg, errText, type Note } from './ui';

const FIELDS: [string, string][] = [['n', 'Nitrogen N (kg/ha)'], ['p', 'Phosphorus P (kg/ha)'], ['k', 'Potassium K (kg/ha)'],
  ['temperature', 'Temperature (C)'], ['humidity', 'Humidity (%)'], ['ph', 'Soil pH'], ['rainfall', 'Rainfall (mm)']];

export default function Crops({ version, onCrop }: { version: number; onCrop: () => void }) {
  const [recs, setRecs] = useState<{ disclaimer: string; crops: CropRec[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [res, setRes] = useState<ModelResult | null>(null);

  useEffect(() => {
    api.recommendations().then(setRecs).catch((e) => setNote({ text: errText(e), kind: 'err' }));
    api.report().then((r) => {
      setSelected(r.crop?.key ?? null);
      // Pre-fill only values we really have; soil nutrients and rainfall are left for the farmer.
      setV((o) => ({ ...o, temperature: o.temperature ?? (r.weather.effective.temp?.toString() ?? ''), humidity: o.humidity ?? (r.weather.effective.humidity?.toString() ?? ''), ph: o.ph ?? (r.profile.ph?.toString() ?? '') }));
    }).catch(() => undefined);
  }, [version]);

  async function choose(crop: string, name: string) {
    try { await api.setCrop(crop); setSelected(crop); setNote({ text: `${name} selected. Fertilizer, photo and yield tabs now use it.`, kind: 'ok' }); onCrop(); }
    catch (e) { setNote({ text: errText(e), kind: 'err' }); }
  }
  async function run() {
    if (FIELDS.some(([k]) => (v[k] ?? '') === '')) return setNote({ text: 'Please fill all 7 values for the AI model.', kind: 'err' });
    setNote(null);
    try { setRes(await api.modelCrop(v)); } catch (e) { setNote({ text: errText(e), kind: 'err' }); }
  }
  return (
    <>
      <Msg note={note} />
      <Card title="AI crop model">
        <p className="mu">Enter your soil-test and climate values. Nothing is filled in for you except values already saved on this farm.</p>
        <div className="g">{FIELDS.map(([k, l]) => (
          <div key={k}><label>{l}</label><input type="number" step="any" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>))}</div>
        <button className="b" onClick={run}>Run AI model</button>
        {res && <>
          <h3>Model result</h3>
          {res.unusual && <div className="m warn">Some values are unusual for the top crop, so treat this result with extra care.</div>}
          {res.top.map((t) => (
            <div className="hr" key={t.crop}>
              <span><b>{t.name}</b> <span className="tag">{(t.score * 100).toFixed(1)}% model score</span></span>
              {t.hasCareData ? <button className={`b s${selected === t.crop ? ' on' : ''}`} onClick={() => choose(t.crop, t.name)}>{selected === t.crop ? 'Selected' : 'Select'}</button> : <span className="mu">no care data</span>}
            </div>))}
          <p className="mu">{res.note}</p>
        </>}
      </Card>
      {recs && <Card title="Crops for your farm"><div className="m warn">{recs.disclaimer}</div></Card>}
      {recs?.crops.map((c) => (
        <Card key={c.crop}>
          <div className="hr"><h2>{c.name}</h2><span className="tag">{c.score}/100</span></div>
          <p className="mu">Sowing: {c.sowing} - Duration: {c.duration} - {c.conditions}</p>
          <List items={c.reasons} />
          <p className="mu">{c.typicalYield ? `Typical yield ${c.typicalYield.join('-')} t/ha (all-India government records).` : 'No yield records yet.'} Season, pH and yield come from datasets; duration and soil type are general agronomy knowledge.</p>
          <button className={`b${selected === c.crop ? ' s' : ''}`} onClick={() => choose(c.crop, c.name)}>{selected === c.crop ? 'Selected' : 'Select this crop'}</button>
        </Card>))}
    </>
  );
}
