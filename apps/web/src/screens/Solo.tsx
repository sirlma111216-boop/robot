import { useMemo, useState } from 'react';
import { Scene, TopBar } from '../ui/common';
import { navigate } from '../App';
import { GameFlow } from './game/GameFlow';
import { GameClient } from '../state/store';
import { LocalTransport } from '../net/transport';
import type { BotLevel } from '@scrap/core';

export function Solo() {
  const [nick, setNick] = useState(() => { try { return localStorage.getItem('sc:soloNick') ?? ''; } catch { return ''; } });
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [matches, setMatches] = useState<1 | 3>(1);
  const [client, setClient] = useState<GameClient | null>(null);
  const start = () => {
    try { localStorage.setItem('sc:soloNick', nick); } catch { /* noop */ }
    setClient(new GameClient(new LocalTransport({ nick: nick || '나', bots, botLevel: level, matches, planSeconds: 30, buildSeconds: 120 })));
  };
  const flow = useMemo(() => client ? <GameFlow client={client} mode="solo" onExit={() => { client.destroy(); setClient(null); }} /> : null, [client]);
  if (flow) return flow;
  return (
    <Scene bg="BG-04" dim>
      <TopBar title="혼자 연습"><button className="btn ghost small" onClick={() => navigate('/')}>← 처음으로</button></TopBar>
      <div className="center">
        <div className="panel col" style={{ width: 'min(520px, 100%)', gap: 14 }}>
          <h2>봇과 한 판</h2>
          <p className="muted small">같은 규칙, 같은 물리. 내 브라우저 안에서 바로 돌아가요.</p>
          <label className="col" style={{ gap: 4 }}><span className="small muted">닉네임</span><input className="input" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="나" maxLength={10} /></label>
          <div className="col" style={{ gap: 4 }}>
            <span className="small muted">상대 봇 수</span>
            <div className="row">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`btn small ${bots === n ? 'teal' : ''}`} onClick={() => setBots(n)}>{n}대</button>)}</div>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="small muted">봇 난도</span>
            <div className="row">{(['easy', 'normal', 'hard'] as BotLevel[]).map((l) => <button key={l} className={`btn small ${level === l ? 'teal' : ''}`} onClick={() => setLevel(l)}>{l === 'easy' ? '쉬움' : l === 'normal' ? '보통' : '어려움'}</button>)}</div>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="small muted">경기 수</span>
            <div className="row"><button className={`btn small ${matches === 1 ? 'teal' : ''}`} onClick={() => setMatches(1)}>빠른 1경기 (폐차장)</button><button className={`btn small ${matches === 3 ? 'teal' : ''}`} onClick={() => setMatches(3)}>표준 3경기 (3챕터)</button></div>
          </div>
          <button className="btn primary big" onClick={start}>시작!</button>
        </div>
      </div>
    </Scene>
  );
}
