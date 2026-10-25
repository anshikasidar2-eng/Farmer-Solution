import { useState } from 'react';
import { api, setToken } from './api';
import { Card, Msg, errText, type Note } from './ui';

export default function Auth({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  async function go(signup: boolean) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setNote({ text: 'Enter a valid email address.', kind: 'err' });
    if (password.length < 8) return setNote({ text: 'Password must be at least 8 characters.', kind: 'err' });
    setBusy(true); setNote(null);
    try {
      const r = await (signup ? api.signup(email, password) : api.login(email, password));
      setToken(r.token); onDone();
    } catch (e) { setNote({ text: errText(e), kind: 'err' }); }
    setBusy(false);
  }
  return (
    <Card title="Log in or create an account">
      <Msg note={note} />
      <label>Email</label>
      <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label>Password (8+ characters)</label>
      <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="row">
        <button className="b" disabled={busy} onClick={() => go(false)}>Log in</button>
        <button className="b s" disabled={busy} onClick={() => go(true)}>Sign up</button>
      </div>
    </Card>
  );
}
