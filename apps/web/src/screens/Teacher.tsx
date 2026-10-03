import React, { useEffect, useMemo, useState } from 'react';
import { Scene, TopBar, QR } from '../ui/common';
import { navigate } from '../App';
import { GameFlow } from './game/GameFlow';
import { GameClient } from '../state/store';
import { NetworkTransport } from '../net/transport';

const LAST_KEY = 'sc:teacherClass';

export function TeacherRoute() {
  const [auth, setAuth] = useState<'checking' | 'no' | 'yes'>('checking');
  useEffect(() => { fetch('/api/teacher/me').then((r) => r.json()).then((r) => setAuth(r.ok ? 'yes' : 'no')).catch(() => setAuth('no')); }, []);
  if (auth === 'checking') return <Scene bg="BG-08"><div className="center"><div className="panel">확인 중…</div></div></Scene>;
  if (auth === 'no') return <TeacherLogin onDone={() => setAuth('yes')} />;
  return <TeacherHome />;
}

function TeacherLogin({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState('teacher');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch('/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, password: pw }) }).then((x) => x.json());
      if (r.ok) onDone(); else setError(r.error ?? '로그인 실패');
    } catch { setError('서버에 연결할 수 없어요.'); } finally { setBusy(false); }
  };
  return (
    <Scene bg="BG-08">
      <TopBar title="교사 로그인"><button className="btn ghost small" onClick={() => navigate('/')}>← 처음으로</button></TopBar>
      <div className="center">
        <form className="panel col" style={{ width: 'min(400px, 100%)', gap: 12 }} onSubmit={submit}>
          <h2>관제실 입장</h2>
          <label className="col" style={{ gap: 4 }}><span className="small muted">아이디</span><input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" /></label>
          <label className="col" style={{ gap: 4 }}><span className="small muted">비밀번호</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus /></label>
          {error && <div className="tag danger">{error}</div>}
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        </form>
      </div>
    </Scene>
  );
}

function TeacherHome() {
  const [code, setCode] = useState<string | null>(() => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } });
  const [client, setClient] = useState<GameClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const create = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/class', { method: 'POST' }).then((x) => x.json());
      if (!r.ok) { setError(r.error ?? '클래스를 만들 수 없어요.'); return; }
      try { localStorage.setItem(LAST_KEY, r.code); } catch { /* noop */ }
      setCode(r.code);
    } catch { setError('서버에 연결할 수 없어요.'); } finally { setBusy(false); }
  };
  const open = (c: string) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    setClient((prev) => { prev?.destroy(); return new GameClient(new NetworkTransport(`${proto}://${location.host}/ws/${c}`)); });
  };
  // 관제실을 떠나면(뒤로가기 포함) 교사 소켓을 닫는다
  useEffect(() => () => { client?.destroy(); }, [client]);
  const resume = async (c: string) => {
    setError('');
    let res: Response;
    try { res = await fetch(`/api/class/${c}`); } catch { setError('서버에 연결할 수 없어요. 인터넷 연결을 확인해요.'); return; }
    if (res.status === 404) { setError('그 코드의 클래스는 없거나 이미 정리됐어요. 새로 만들어요.'); try { localStorage.removeItem(LAST_KEY); } catch { /* noop */ } setCode(null); return; }
    if (!res.ok) { setError('지금은 클래스를 열 수 없어요. 잠시 후 다시 해요.'); return; }
    try { localStorage.setItem(LAST_KEY, c); } catch { /* noop */ }
    setCode(c); open(c);
  };
  const flow = useMemo(() => client && code ? <GameFlow client={client} mode="teacher" onExit={() => setClient(null)} /> : null, [client, code]);
  if (flow) return flow;
  const joinUrl = code ? `${location.origin}/join?code=${code}` : '';
  return (
    <Scene bg="BG-08">
      <TopBar title="교사 관제실" sub="클래스 만들기">
        <button className="btn ghost small" onClick={async () => { try { await fetch('/api/teacher/logout', { method: 'POST' }); } catch { /* 오프라인이어도 화면은 나간다 */ } navigate('/'); }}>로그아웃</button>
      </TopBar>
      <div className="center">
        <div className="panel col" style={{ width: 'min(760px, 100%)', gap: 14 }}>
          {code ? (
            <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
              <QR text={joinUrl} size={200} />
              <div className="col" style={{ flex: 1, gap: 8 }}>
                <h2>클래스 코드 <span style={{ color: 'var(--amber)', letterSpacing: '0.15em' }}>{code}</span></h2>
                <p className="muted small">학생들은 QR을 찍거나 아래 주소로 들어와요. 닉네임만 입력하면 끝.</p>
                <code style={{ background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: 8, fontSize: 13, wordBreak: 'break-all' }}>{joinUrl}</code>
                <div className="row">
                  <button className="btn primary big" onClick={() => resume(code)}>관제실 열기 →</button>
                  <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(joinUrl)}>주소 복사</button>
                  <button className="btn ghost" onClick={() => { setCode(null); try { localStorage.removeItem(LAST_KEY); } catch { /* noop */ } }}>다른 클래스</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h2>새 클래스 만들기</h2>
              <p className="muted small">클래스 하나에 학생 최대 30명, 팀 최대 6개. 마지막 활동 후 24시간이 지나면 자동으로 정리돼요.</p>
              <button className="btn primary big" onClick={create} disabled={busy}>{busy ? '만드는 중…' : '클래스 만들기'}</button>
              <div className="divider" />
              <div className="row"><input className="input" style={{ flex: 1 }} placeholder="기존 클래스 코드로 열기" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} maxLength={8} /><button className="btn" onClick={() => manual && resume(manual)}>열기</button></div>
            </>
          )}
          {error && <div className="tag danger">{error}</div>}
        </div>
      </div>
    </Scene>
  );
}
