import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Care } from './types';
import { Card, List, Msg, errText, type Note } from './ui';

export default function CarePage({ version, onGo }: { version: number; onGo: (t: string) => void }) {
  const [c, setC] = useState<Care | null>(null);
  const [needCrop, setNeedCrop] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [npk, setNpk] = useState({ n: '', p: '', k: '' });
  const [match, setMatch] = useState<{ product: string; farFromExamples: boolean; note: string } | null>(null);

  useEffect(() => {
    setNeedCrop(false);
    api.care().then(setC).catch((e) => {
      if (e instanceof ApiError && e.status === 409) setNeedCrop(true); else setNote({ text: errText(e), kind: 'err' });
    });
  }, [version]);

  async function find() {
    setNote(null);
    try { setMatch(await api.fertMatch(npk.n, npk.p, npk.k)); } catch (e) { setNote({ text: errText(e), kind: 'err' }); }
  }
  return (
    <>
      <Msg note={note} />
      {needCrop && <Card><p>Please <button className="link" onClick={() => onGo('crops')}>select a crop</button> first.</p></Card>}
      {c && <>
        <Card title={`Fertilizer for ${c.name}`}>
          <div className={`m ${c.fertilizer.preliminary ? 'warn' : 'ok'}`}>{c.fertilizer.message}</div>
          {c.fertilizer.available && <div className="sc"><table><thead><tr><th>Nutrient</th><th>kg/ha</th><th>kg/acre</th><th>Note</th></tr></thead>
            <tbody>{c.fertilizer.rows.map((r) => <tr key={r.nutrient}><td>{r.nutrient}</td><td>{r.kgPerHa}</td><td>{r.kgPerAcre}</td><td className="mu">{r.note || '-'}</td></tr>)}</tbody></table></div>}
          <p className="mu">{c.fertilizer.guidance}</p>
        </Card>
        <Card title="Irrigation"><List items={c.irrigation} /></Card>
        <Card title="Weather precautions"><List items={c.weatherPrecautions} /></Card>
      </>}
      <Card title="Fertilizer product finder">
        <p className="mu">Uses the Fertilizer Prediction dataset (99 distinct examples). In that data the product follows the N, P and K values, so only those are used. Enter the amounts your soil-test report says to supply.</p>
        <div className="g">{(['n', 'p', 'k'] as const).map((k) => (
          <div key={k}><label>{{ n: 'Nitrogen N', p: 'Phosphorus P', k: 'Potassium K' }[k]}</label><input type="number" value={npk[k]} onChange={(e) => setNpk({ ...npk, [k]: e.target.value })} /></div>))}</div>
        <button className="b" onClick={find}>Find product</button>
        {match && <><div className="m ok">Closest match: <b>{match.product}</b>{match.farFromExamples && <><br />Your values are far from any example, so treat this as a rough guess.</>}</div><p className="mu">{match.note}</p></>}
      </Card>
    </>
  );
}
