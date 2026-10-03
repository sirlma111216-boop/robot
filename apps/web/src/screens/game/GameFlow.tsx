import React, { useEffect, useState } from 'react';
import type { ClassView, TeamView } from '@scrap/core';
import { GameClient, useClientState, type ClientState } from '../../state/store';
import { Scene, Toasts } from '../../ui/common';
import { preload, SCENE_ASSETS } from '../../assets/loader';
import { Lobby } from './Lobby';
import { Build } from './Build';
import { Intro } from './Intro';
import { Plan } from './Plan';
import { Battle } from './Battle';
import { Podium } from './Podium';
import { TeacherConsole } from './TeacherConsole';

export type Mode = 'student' | 'teacher' | 'solo';
export interface ScreenProps { client: GameClient; state: ClientState; view: ClassView; mode: Mode; onExit: () => void; openConsole?: () => void }

export function myTeamOf(view: ClassView): TeamView | null { return view.me?.teamId ? view.teams.find((t) => t.id === view.me!.teamId) ?? null : null; }
export function isLeaderOf(view: ClassView): boolean { return !!view.me?.isLeader; }

export function GameFlow({ client, mode, onExit }: { client: GameClient; mode: Mode; onExit: () => void }) {
  const state = useClientState(client);
  const view = state.view;
  const [consoleOpen, setConsoleOpen] = useState(false);
  useEffect(() => {
    if (!view) return;
    const ph = view.phase;
    if (ph === 'LOBBY') preload(SCENE_ASSETS.lobby);
    else if (ph === 'BUILD') preload([...SCENE_ASSETS.build, ...SCENE_ASSETS.intro]);
    else if (ph === 'PITSTOP') preload([...SCENE_ASSETS.pitstop, ...SCENE_ASSETS.build]);
    else if (ph === 'INTRO' || ph === 'PLAN') preload([...SCENE_ASSETS.arena, view.match?.arenaId ?? 'AR-01']);
    else if (ph === 'PODIUM') preload(SCENE_ASSETS.podium);
  }, [view?.phase]);

  if (state.kicked) return <Scene bg="BG-02" dim><div className="center"><div className="panel col"><h2>클래스에서 나왔어요</h2><p className="muted">선생님이 내보냈거나 클래스가 종료됐어요.</p><button className="btn primary" onClick={onExit}>처음으로</button></div></div></Scene>;
  if (!view) return <Scene bg="BG-02" dim><div className="center"><div className="panel col" style={{ alignItems: 'center' }}><h2>{state.connected ? '입장 중…' : '연결 중…'}</h2><p className="muted small">잠시만 기다려요.</p><button className="btn ghost small" onClick={onExit}>나가기</button></div></div></Scene>;

  const props: ScreenProps = { client, state, view, mode, onExit, openConsole: mode === 'teacher' ? () => setConsoleOpen(true) : undefined };
  let screen: React.ReactNode;
  switch (view.phase) {
    case 'LOBBY': screen = <Lobby {...props} />; break;
    case 'BUILD': case 'PITSTOP': screen = <Build {...props} />; break;
    case 'INTRO': screen = <Intro {...props} />; break;
    case 'PLAN': screen = <Plan {...props} />; break;
    case 'BATTLE': screen = <Battle {...props} />; break;
    case 'PODIUM': screen = <Podium {...props} />; break;
    default: screen = <Scene bg="BG-02"><div className="center">…</div></Scene>;
  }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {screen}
      {mode === 'teacher' && view.phase !== 'LOBBY' && (
        <>
          <button className="btn small" style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 12 }} onClick={() => setConsoleOpen(true)} aria-label="교사 관제 열기">🎓 관제</button>
          {consoleOpen && <TeacherConsole {...props} drawer onClose={() => setConsoleOpen(false)} />}
        </>
      )}
      {mode === 'solo' && view.phase !== 'LOBBY' && view.phase !== 'PODIUM' && <button className="btn small ghost" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 12, background: 'rgba(5,10,20,0.75)' }} onClick={() => { if (window.confirm('연습을 끝내고 나갈까요?')) onExit(); }}>연습 끝내기</button>}
      {!state.connected && client.transport.kind === 'network' && <div className="tag danger" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 12 }}>연결 끊김 · 다시 연결 중…</div>}
      <Toasts toasts={state.toasts} />
    </div>
  );
}
