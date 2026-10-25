import { useEffect, useRef, useState } from 'react';
import { api, ApiError, imageUrl } from './api';
import type { Disease, Meta } from './types';
import { Card, List, Msg, errText, type Note } from './ui';

function Thumb({ id }: { id: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let u = ''; imageUrl(id).then((s) => { u = s; setSrc(s); }).catch(() => undefined); return () => { if (u) URL.revokeObjectURL(u); }; }, [id]);
  return src ? <img className="thumb" src={src} alt="Uploaded plant" /> : null;
}

function Result({ r }: { r: Disease }) {
  if (!r.clear) return <Card><div className="m err">{r.message || 'The photo is not clear enough to judge.'}</div><p>Please retake it closer, in daylight, focused on one leaf, or ask an agriculture expert.</p></Card>;
  return (
    <Card title={r.condition || 'Result'}>
      <p>Plant: <b>{r.plant}</b> - Confidence: <b>{r.confidence}</b> <span className="tag">{r.provider}</span></p>
      {r.warnings.map((w, i) => <div className="m warn" key={i}>{w}</div>)}
      <h3>Visible symptoms</h3><List items={r.symptoms} />
      <h3>Possible causes</h3><List items={r.causes} />
      <h3>Treatment options</h3><List items={r.treatment} />
      <h3>Prevention</h3><List items={r.prevention} />
      <h3>Nutrients</h3><p>{r.nutrients || '-'}</p>
      <h3>Irrigation and crop care</h3><p>{r.care || '-'}</p>
      <h3>See an expert if</h3><p>{r.expert}</p>
    </Card>
  );
}

export default function Photo({ meta, version, onGo }: { meta: Meta; version: number; onGo: (t: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [setup, setSetup] = useState<string[]>([]);
  const [result, setResult] = useState<Disease | null>(null);
  const [past, setPast] = useState<Disease[]>([]);
  const [needCrop, setNeedCrop] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const loadPast = () => api.analyses().then(setPast).catch(() => undefined);
  useEffect(() => { loadPast(); }, [version]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setNote({ text: 'Please choose a JPG, PNG or WebP photo.', kind: 'err' });
    if (f.size > 8 * 1024 * 1024) return setNote({ text: 'Photo is too large. Use one under 8 MB.', kind: 'err' });
    setNote(null); setFile(f); setPreview(URL.createObjectURL(f)); setResult(null);
  }
  async function analyze() {
    if (!file) return setNote({ text: 'Choose a photo first.', kind: 'err' });
    setBusy(true); setNote(null); setSetup([]); setNeedCrop(false);
    try { setResult(await api.disease(file)); setNote({ text: 'Analysis complete.', kind: 'ok' }); loadPast(); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) setNeedCrop(true);
      if (e instanceof ApiError && Array.isArray(e.extra.setup)) setSetup(e.extra.setup as string[]);
      setNote({ text: errText(e), kind: 'err' });
    }
    setBusy(false);
  }
  return (
    <>
      <Card title="Check a plant photo">
        <p className="mu">Upload one clear, close photo of one affected leaf in daylight. The result uses your saved crop, location and weather.</p>
        {meta.diseaseProvider === 'none' && <div className="m warn">Disease detection is not configured on this server yet, so no result will be shown. See the setup steps in the README.</div>}
        {meta.diseaseProvider === 'claude' && <div className="m warn">Photos are read by a general AI model, not a trained plant-disease classifier. Confirm serious problems with an expert.</div>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />
        {preview && <img className="pv" src={preview} alt="Selected plant" />}
        <Msg note={note} />
        {needCrop && <p>Please <button className="link" onClick={() => onGo('crops')}>select a crop</button> first.</p>}
        {setup.length > 0 && <List items={setup} />}
        <button className="b" disabled={busy || !file} onClick={analyze}>{busy ? 'Analyzing...' : 'Analyze photo'}</button>
      </Card>
      {result && <Result r={result} />}
      {past.length > 0 && <Card title="Previous checks">{past.map((p) => (
        <div className="hr" key={p.id}><div><b>{p.clear ? `${p.plant} - ${p.condition}` : 'Unclear photo'}</b><div className="mu">{p.createdAt?.slice(0, 10)} - {p.provider}</div></div>{p.id != null && <Thumb id={p.id} />}</div>))}</Card>}
    </>
  );
}
