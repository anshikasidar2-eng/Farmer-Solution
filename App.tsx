import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { Meta, Profile } from './types';
import { Card, errText } from './ui';
import Auth from './Auth';
import ProfileForm from './ProfileForm';
import Home from './Home';
import Crops from './Crops';
import Care from './CarePage';
import Photo from './Photo';
import Yield from './YieldPage';

const TABS = [['home', 'Home'], ['crops', 'Crops'], ['care', 'Fertilizer & Water'], ['photo', 'Photo check'], ['yield', 'Yield'], ['profile', 'Profile']] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean>(!!getToken());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [version, setVersion] = useState(0); // bumps when profile or crop changes so every tab refreshes
  const [fatal, setFatal] = useState('');

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const logout = useCallback(() => { setToken(null); setLoggedIn(false); setProfile(null); setTab('home'); }, []);

  useEffect(() => { api.meta().then(setMeta).catch((e) => setFatal(errText(e))); }, []);
  useEffect(() => {
    window.addEventListener('auth-expired', logout);
    return () => window.removeEventListener('auth-expired', logout);
  }, [logout]);
  useEffect(() => {
    if (!loggedIn) { setReady(true); return; }
    setReady(false);
    api.me().then((r) => setProfile(r.profile)).catch(() => undefined).finally(() => setReady(true));
  }, [loggedIn]);

  const header = <header><h1>AgriSmart AI</h1><p>One photo, one location, smarter farming.</p></header>;
  if (fatal) return <>{header}<main><Card><div className="m err">{fatal}</div></Card></main></>;
  if (!meta || !ready) return <>{header}<main><p className="mu">Loading...</p></main></>;
  if (!loggedIn) return <>{header}<main><Auth onDone={() => setLoggedIn(true)} /></main></>;
  if (!profile) return <>{header}<main><ProfileForm initial={null} meta={meta} onLogout={logout} onSaved={(p) => { setProfile(p); setTab('home'); bump(); }} /></main></>;

  return (
    <>
      {header}
      <nav>{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
      <main>
        {tab === 'home' && <Home meta={meta} version={version} onGo={(t) => setTab(t as Tab)} />}
        {tab === 'crops' && <Crops version={version} onCrop={bump} />}
        {tab === 'care' && <Care version={version} onGo={(t) => setTab(t as Tab)} />}
        {tab === 'photo' && <Photo meta={meta} version={version} onGo={(t) => setTab(t as Tab)} />}
        {tab === 'yield' && <Yield version={version} onGo={(t) => setTab(t as Tab)} />}
        {tab === 'profile' && <ProfileForm initial={profile} meta={meta} onLogout={logout} onSaved={(p) => { setProfile(p); bump(); setTab('home'); }} />}
      </main>
    </>
  );
}
