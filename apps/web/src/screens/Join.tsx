import React, { useState } from 'react';
import { Scene, TopBar } from '../ui/common';
import { navigate, sessionStore } from '../App';
import { NICK_MAX, josa } from '@scrap/core';

export function Join({ code: initialCode }: { code: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = sessionStore.get();
  const sameClass = !!saved && saved.code === code.trim().toUpperCase();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const c = code.trim().toUpperCase();
      const info = await fetch(`/api/class/${c}`).then((r) => r.json());
      if (!info.ok) { setError('그런 클래스 코드는 없어요. 다시 확인해요.'); return; }
      const r = await fetch(`/api/class/${c}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick }) }).then((x) => x.json());
      if (!r.ok) { setError(r.error ?? '입장에 실패했어요.'); return; }
      sessionStore.set({ code: c, token: r.token, playerId: r.playerId, nick: r.nick });
      navigate('/play');
    } catch { setError('서버에 연결할 수 없어요. 인터넷을 확인해요.'); }
    finally { setBusy(false); }
  };
  return (
    <Scene bg="BG-02" dim>
      <TopBar title="클래스 입장"><button className="btn ghost small" onClick={() => navigate('/')}>← 처음으로</button></TopBar>
      <div className="center">
        <form className="panel col" style={{ width: 'min(420px, 100%)', gap: 14 }} onSubmit={submit}>
          <h2>우리 반 대회에 참가</h2>
          <p className="muted small">선생님이 보여준 코드 또는 QR로 들어와요. 로그인은 필요 없어요.</p>
          <label className="col" style={{ gap: 4 }}><span className="small muted">클래스 코드</span><input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="예: K7S2TD" maxLength={8} autoCapitalize="characters" autoComplete="off" required style={{ letterSpacing: '0.2em', fontWeight: 800, fontSize: 20 }} /></label>
          <label className="col" style={{ gap: 4 }}><span className="small muted">닉네임 (최대 {NICK_MAX}자)</span><input className="input" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="예: 번개민지" maxLength={NICK_MAX} required autoFocus /></label>
          {sameClass && <div className="panel tight col" style={{ gap: 6, borderColor: 'var(--teal)' }}><span className="small">이 클래스에 <strong>{saved!.nick}</strong>{josa(saved!.nick, '으로', '로').slice(saved!.nick.length)} 이미 들어와 있어요. 새로 입장하면 다른 자리가 하나 더 생겨요.</span><button type="button" className="btn teal" onClick={() => navigate('/play')}>{josa(saved!.nick, '으로', '로')} 이어서 참가</button></div>}
          {error && <div className="tag danger">{error}</div>}
          <button className="btn primary big" type="submit" disabled={busy || !code || !nick.trim()}>{busy ? '입장 중…' : '입장하기'}</button>
        </form>
      </div>
    </Scene>
  );
}
