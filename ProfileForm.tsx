import { useState } from 'react';
import { api } from './api';
import type { Meta, Profile } from './types';
import { Card, Msg, errText, type Note } from './ui';

type Form = Record<'name' | 'state' | 'district' | 'village' | 'farmSize' | 'unit' | 'soil' | 'irrigation' | 'ph' | 'nLevel' | 'pLevel' | 'kLevel', string>;

const fromProfile = (p: Profile | null): Form => ({
  name: p?.name ?? '', state: p?.state ?? '', district: p?.district ?? '', village: p?.village ?? '',
  farmSize: p ? String(p.farmSize) : '', unit: p?.unit ?? 'acre', soil: p?.soil ?? 'unknown', irrigation: p?.irrigation ?? 'rainfed',
  ph: p?.ph != null ? String(p.ph) : '', nLevel: p?.nLevel ?? '', pLevel: p?.pLevel ?? '', kLevel: p?.kLevel ?? '',
});
const LEVELS: [string, string][] = [['', 'Unknown'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];

export default function ProfileForm({ initial, meta, onSaved, onLogout }: {
  initial: Profile | null; meta: Meta; onSaved: (p: Profile) => void; onLogout?: () => void;
}) {
  const [f, setF] = useState<Form>(fromProfile(initial));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim() || !f.state.trim() || !f.district.trim() || !f.village.trim()) return setNote({ text: 'Please fill name, state, district and village.', kind: 'err' });
    if (!(Number(f.farmSize) > 0)) return setNote({ text: 'Enter a farm size greater than 0.', kind: 'err' });
    if (f.ph !== '' && (Number(f.ph) < 3 || Number(f.ph) > 10)) return setNote({ text: 'Soil pH must be between 3 and 10.', kind: 'err' });
    setBusy(true); setNote(null);
    try {
      const r = await api.saveProfile({
        name: f.name.trim(), state: f.state.trim(), district: f.district.trim(), village: f.village.trim(),
        farmSize: Number(f.farmSize), unit: f.unit as 'acre' | 'ha', soil: f.soil, irrigation: f.irrigation,
        ph: f.ph === '' ? null : Number(f.ph), nLevel: f.nLevel || null, pLevel: f.pLevel || null, kLevel: f.kLevel || null,
      });
      onSaved(r.profile);
    } catch (e) { setNote({ text: errText(e), kind: 'err' }); }
    setBusy(false);
  }
  const select = (k: keyof Form, opts: [string, string][]) => (
    <select value={f[k]} onChange={set(k)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  return (
    <Card title={initial ? 'Edit profile' : 'Set up your farm profile'}>
      <Msg note={note} />
      <div className="g">
        <div><label>Your name *</label><input value={f.name} onChange={set('name')} /></div>
        <div><label>State *</label><input list="states" value={f.state} onChange={set('state')} /></div>
        <div><label>District *</label><input list="districts" value={f.district} onChange={set('district')} /></div>
        <div><label>Village *</label><input value={f.village} onChange={set('village')} /></div>
        <div><label>Farm size *</label><input type="number" min="0.1" step="0.1" value={f.farmSize} onChange={set('farmSize')} /></div>
        <div><label>Unit</label>{select('unit', [['acre', 'Acres'], ['ha', 'Hectares']])}</div>
        <div><label>Soil type</label>{select('soil', [['unknown', 'Not sure'], ['loam', 'Loam'], ['clay', 'Clay'], ['sandy', 'Sandy'], ['black', 'Black (regur)']])}</div>
        <div><label>Water / irrigation</label>{select('irrigation', [['rainfed', 'Rain only'], ['canal', 'Canal / well / pump'], ['drip', 'Drip / sprinkler']])}</div>
        <div><label>Soil pH (optional, from soil test)</label><input type="number" min="3" max="10" step="0.1" value={f.ph} onChange={set('ph')} /></div>
        <div><label>Nitrogen level (soil test)</label>{select('nLevel', LEVELS)}</div>
        <div><label>Phosphorus level</label>{select('pLevel', LEVELS)}</div>
        <div><label>Potassium level</label>{select('kLevel', LEVELS)}</div>
      </div>
      <datalist id="states">{meta.states.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="districts">{meta.districts.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="row">
        <button className="b" disabled={busy} onClick={save}>{busy ? 'Saving...' : initial ? 'Save profile' : 'Continue'}</button>
        {onLogout && <button className="b s" onClick={onLogout}>Log out</button>}
      </div>
    </Card>
  );
}
