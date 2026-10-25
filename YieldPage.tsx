import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { YieldEst } from './types';
import { Card, List, Msg, errText, type Note } from './ui';

export default function YieldPage({ version, onGo }: { version: number; onGo: (t: string) => void }) {
  const [y, setY] = useState<YieldEst | null>(null);
  const [needCrop, setNeedCrop] = useState(false);
  const [note, setNote] = useState<Note>(null);
  useEffect(() => {
    setNeedCrop(false);
    api.yield().then(setY).catch((e) => { if (e instanceof ApiError && e.status === 409) setNeedCrop(true); else setNote({ text: errText(e), kind: 'err' }); });
  }, [version]);
  if (needCrop) return <Card><p>Please <button className="link" onClick={() => onGo('crops')}>select a crop</button> first.</p></Card>;
  if (!y) return <Msg note={note} />;
  if (y.unavailable || !y.perHa || !y.production) return <Card title={`Yield: ${y.name}`}><div className="m warn">{y.message}</div></Card>;
  return (
    <Card title={`Yield estimate: ${y.name}`}>
      <div className="m warn">Estimate only, not a guarantee. Source: {y.source}</div>
      <p>Per hectare: <b>{y.perHa.low}-{y.perHa.high} {y.unit}</b> (middle about {y.perHa.mid})</p>
      <p>Your farm ({y.areaHa} ha): <b>{y.production.low}-{y.production.high} {y.production.unit}</b></p>
      <h3>What changes the yield</h3><List items={y.factors?.length ? y.factors : ['No major negatives found in your inputs']} />
      <h3>Ways to improve</h3><List items={y.improve ?? []} />
      <p className="mu">{y.note}</p>
    </Card>
  );
}
