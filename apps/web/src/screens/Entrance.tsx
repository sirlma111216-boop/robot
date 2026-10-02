import React, { useEffect, useState } from 'react';
import { Scene, Speaker } from '../ui/common';
import { navigate, sessionStore } from '../App';
import { preload, SCENE_ASSETS } from '../assets/loader';

const TIPS = ['로봇을 만들고, 세 수를 읽어라.', '모두 동시에 움직인다. 상대가 어디로 갈지 읽어!', '튕겨 다니는 왕관 곁에 혼자 남으면 3점, 상대를 떨어뜨리면 2점.'];

export function Entrance() {
  const [tip, setTip] = useState(0);
  const session = sessionStore.get();
  useEffect(() => { preload(SCENE_ASSETS.entrance); const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3800); return () => clearInterval(id); }, []);
  return (
    <Scene bg="BG-01">
      <div style={{ position: 'absolute', left: 'clamp(16px, 6vw, 90px)', top: '50%', transform: 'translateY(-50%)', width: 'min(460px, 92vw)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="hero-sub">SCRAP CITY CHAMPIONSHIP</div>
          <h1 className="hero-title">스크랩<br />크라운</h1>
          <p style={{ marginTop: 10, fontWeight: 700, fontSize: 17, textShadow: '0 2px 8px #000' }}>{TIPS[tip]}</p>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <button className="menu-card" onClick={() => navigate('/join')}><span className="t">🏭 클래스 입장</span><span className="d">선생님이 알려준 코드나 QR로 우리 반 대회에 참가</span></button>
          {session && <button className="menu-card" style={{ borderColor: 'var(--teal)' }} onClick={() => navigate('/play')}><span className="t">↩ 이어서 참가 ({session.code})</span><span className="d">{session.nick} 님, 진행 중인 클래스로 돌아가기</span></button>}
          <button className="menu-card" onClick={() => navigate('/solo')}><span className="t">🤖 혼자 연습</span><span className="d">봇과 바로 한 판. 로그인 없이 60초 안에 시작</span></button>
          <button className="menu-card" onClick={() => navigate('/teacher')}><span className="t">🎓 교사</span><span className="d">클래스 만들기 · 팀장 지정 · 관전/참가</span></button>
        </div>
      </div>
      <Speaker who="정비사 미라" image="CH-01" text="어서 와, 신입! 고철로 로봇을 조립하고 3개 명령을 미리 정하면, 모든 로봇이 동시에 움직여. 준비됐지?" style={{ right: 24, bottom: 16 }} />
      <MovingDemo />
    </Scene>
  );
}

/** 첫 화면의 "동시 명령 → 동시 이동" 짧은 움직이는 예시 */
function MovingDemo() {
  const [t, setT] = useState(0);
  useEffect(() => { let raf = 0; const start = performance.now(); const loop = () => { setT(((performance.now() - start) / 1000) % 6); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, []);
  const phase = t < 2 ? 0 : t < 5 ? 1 : 2; // 0: 명령 입력, 1: 동시 이동, 2: 충돌
  const k = Math.max(0, Math.min(1, (t - 2) / 2.2));
  return (
    <div className="panel tight" style={{ position: 'absolute', right: 24, top: 24, width: 300, height: 130, overflow: 'hidden' }} aria-hidden>
      <div className="small muted" style={{ marginBottom: 4 }}>{phase === 0 ? '① 명령 3개를 미리 정하고…' : phase === 1 ? '② 모두 동시에 움직이고…' : '③ 부딪히며 결과가 갈린다!'}</div>
      <svg viewBox="0 0 280 90" width="100%" height="90">
        <circle cx="140" cy="45" r="22" fill="none" stroke="#ffd25a" strokeDasharray="6 5" />
        <g transform={`translate(${30 + k * 90} 45)`}><circle r="14" fill="#ff5c5c" stroke="#fff" strokeWidth="2" /><path d="M0-10L6-2H-6Z" fill="#fff" /></g>
        <g transform={`translate(${250 - k * 90} 45)`}><circle r="14" fill="#4d9dff" stroke="#fff" strokeWidth="2" /><path d="M0 10L6 2H-6Z" fill="#fff" /></g>
        {phase === 2 && <g transform="translate(140 45)"><path d="M-30-30L-10-8M30-30L10-8M-30 30L-10 8M30 30L10 8" stroke="#ffb84d" strokeWidth="3" /></g>}
        {phase === 0 && ['⬆', '⬆', '⛔'].map((c, i) => <text key={i} x={100 + i * 30} y="82" fontSize="14" fill="#fff">{c}</text>)}
      </svg>
    </div>
  );
}
