import React, { useState } from 'react';
import { TEAM_STYLES, MAX_TEAMS, type BotLevel } from '@scrap/core';
import { QR, TeamBadge, Timer } from '../../ui/common';
import type { ScreenProps } from './GameFlow';

const PHASE_KO: Record<string, string> = { LOBBY: '대기실', BUILD: '조립', INTRO: '입장', PLAN: '전술 계획', BATTLE: '전투 재생', PITSTOP: '피트스톱', PODIUM: '시상대' };

export function TeacherConsole({ client, view, drawer, onClose, onExit }: ScreenProps & { drawer?: boolean; onClose?: () => void }) {
  const send = client.send.bind(client);
  const [confirm, setConfirm] = useState<string | null>(null);
  const students = view.players.filter((p) => p.role === 'student');
  const free = students.filter((p) => !p.teamId);
  const joinUrl = `${location.origin}/join?code=${view.code}`;
  const me = view.me;
  const myTeam = me?.teamId ? view.teams.find((t) => t.id === me.teamId) : null;
  const inLobby = view.phase === 'LOBBY';
  const lvl = (l: BotLevel) => (l === 'easy' ? '쉬움' : l === 'normal' ? '보통' : '어려움');
  const body = (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h2 style={{ fontSize: 20 }}>관제실 · {PHASE_KO[view.phase]}</h2><span className="small muted">코드 {view.code} · 학생 {students.length}/30 · 팀 {view.teams.length}/{MAX_TEAMS}{view.match ? ` · ${view.match.index + 1}경기 ${view.match.turn}/${view.match.totalTurns}턴` : ''}</span></div>
        {drawer && <button className="btn ghost small" onClick={onClose}>닫기 ✕</button>}
      </div>
      {!inLobby && (
        <div className="panel tight col" style={{ gap: 8 }}>
          <div className="row"><Timer deadline={view.deadline} serverNow={() => client.serverNow()} /><span className="small muted">{view.phase === 'PLAN' ? `${view.teams.filter((t) => t.planLocked).length}/${view.teams.length} 팀 확정` : view.phase === 'BUILD' || view.phase === 'PITSTOP' ? `${view.teams.filter((t) => t.buildReady).length}/${view.teams.length} 팀 준비` : ''}</span></div>
          <div className="row">
            <button className="btn small" disabled={view.phase === 'BATTLE' || view.phase === 'PODIUM'} onClick={() => send({ t: 'teacher:skipPhase' })}>⏭ 이 단계 바로 넘기기</button>
            {view.phase !== 'PODIUM' && <button className="btn small danger" onClick={() => setConfirm('end')}>대회 종료</button>}
            {view.phase === 'PODIUM' && <button className="btn small primary" onClick={() => send({ t: 'teacher:reset' })}>대기실로 (다시 하기)</button>}
          </div>
          {confirm === 'end' && <div className="row"><span className="small">지금 순위로 대회를 끝낼까요?</span><button className="btn small danger" onClick={() => { send({ t: 'teacher:endTournament' }); setConfirm(null); }}>네, 종료</button><button className="btn small ghost" onClick={() => setConfirm(null)}>취소</button></div>}
        </div>
      )}
      {inLobby && (
        <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          <QR text={joinUrl} size={150} />
          <div className="col" style={{ flex: 1, gap: 6, minWidth: 220 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '0.15em', color: 'var(--amber)' }}>{view.code}</div>
            <code className="small" style={{ wordBreak: 'break-all', opacity: 0.8 }}>{joinUrl}</code>
            <div className="row">
              <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(joinUrl)}>주소 복사</button>
              <button className={`btn small ${view.locked ? 'danger' : 'ghost'}`} onClick={() => send({ t: 'teacher:lock', locked: !view.locked })}>{view.locked ? '🔒 입장 잠김 (풀기)' : '🔓 입장 열림 (잠그기)'}</button>
            </div>
          </div>
        </div>
      )}
      {inLobby && (
        <div className="panel tight col" style={{ gap: 8 }}>
          <strong>대회 설정</strong>
          <div className="row">
            <span className="small muted">경기 수</span>
            <button className={`btn small ${view.settings.matches === 1 ? 'teal' : ''}`} onClick={() => send({ t: 'teacher:setSettings', settings: { matches: 1 } })}>빠른 1경기</button>
            <button className={`btn small ${view.settings.matches === 3 ? 'teal' : ''}`} onClick={() => send({ t: 'teacher:setSettings', settings: { matches: 3 } })}>표준 3경기</button>
          </div>
          <div className="row">
            <label className="row small muted">조립 <select className="input" style={{ width: 90, minHeight: 34 }} value={view.settings.buildSeconds} onChange={(e) => send({ t: 'teacher:setSettings', settings: { buildSeconds: Number(e.target.value) } })}>{[60, 90, 120, 180].map((s) => <option key={s} value={s}>{s}초</option>)}</select></label>
            <label className="row small muted">계획 <select className="input" style={{ width: 90, minHeight: 34 }} value={view.settings.planSeconds} onChange={(e) => send({ t: 'teacher:setSettings', settings: { planSeconds: Number(e.target.value) } })}>{[15, 20, 25, 30, 45, 60].map((s) => <option key={s} value={s}>{s}초</option>)}</select></label>
            <label className="row small muted">팀 정원 <select className="input" style={{ width: 80, minHeight: 34 }} value={view.settings.maxTeamSize} onChange={(e) => send({ t: 'teacher:setSettings', settings: { maxTeamSize: Number(e.target.value) } })}>{[3, 4, 5, 6, 8].map((s) => <option key={s} value={s}>{s}명</option>)}</select></label>
            <label className="row small muted">봇 난도 <select className="input" style={{ width: 90, minHeight: 34 }} value={view.settings.botLevel} onChange={(e) => send({ t: 'teacher:setSettings', settings: { botLevel: e.target.value as BotLevel } })}><option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option></select></label>
            <label className="row small muted"><input type="checkbox" checked={view.settings.autoAdvance} onChange={(e) => send({ t: 'teacher:setSettings', settings: { autoAdvance: e.target.checked } })} /> 전원 준비 시 일찍 진행</label>
          </div>
        </div>
      )}
      <div className="panel tight col" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><strong>팀 ({view.teams.length}/{MAX_TEAMS})</strong>
          {inLobby && <div className="row"><button className="btn small" onClick={() => send({ t: 'teacher:addBotTeam' })} disabled={view.teams.length >= MAX_TEAMS}>+ 봇 팀 ({lvl(view.settings.botLevel)})</button><button className="btn small" onClick={() => send({ t: 'teacher:autoAssign' })} disabled={free.length === 0}>남은 학생 자동 배정</button></div>}
        </div>
        {view.teams.length === 0 && <p className="small muted">아래 명단에서 학생을 골라 "팀장 지정"을 누르면 그 학생의 팀이 만들어져요.</p>}
        {view.teams.map((t) => (
          <div key={t.id} className="row" style={{ alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <TeamBadge styleIndex={t.styleIndex} />
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <div className="row"><strong>{t.name}</strong>{t.bot && <span className="tag">봇 · {lvl(t.bot.level)}</span>}<span className="small muted">팀장: {t.leaderNick}</span>{view.match && <span className="tag warn">{t.matchScore}점 · {t.rankPoints}pt</span>}{view.phase === 'PLAN' && <span className={`tag ${t.planLocked ? 'ok' : ''}`}>{t.planLocked ? '확정' : '계획 중'}</span>}{(view.phase === 'BUILD' || view.phase === 'PITSTOP') && <span className={`tag ${t.buildReady ? 'ok' : ''}`}>{t.buildReady ? '준비' : '조립 중'}</span>}</div>
              <div className="members">{t.members.map((m) => <span key={m.id} className={`member ${m.id === t.leaderId ? 'leader' : ''} ${m.connected ? '' : 'off'}`}>{m.id === t.leaderId ? '★ ' : ''}{m.nick}{m.id !== t.leaderId && m.id !== view.teacherId && <button className="btn small ghost" style={{ minHeight: 22, padding: '0 6px', fontSize: 11 }} title="팀장으로" onClick={() => send({ t: 'teacher:assignLeader', playerId: m.id, teamId: t.id })}>★</button>}</span>)}</div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              {!t.bot && (myTeam?.id === t.id ? <button className="btn small ghost" onClick={() => send({ t: 'teacher:leaveLeader' })}>참가 그만</button> : <button className="btn small ghost" onClick={() => send({ t: 'teacher:joinAsLeader', teamId: t.id })} title="이 팀의 팀장으로 함께 참가">🎮 팀장으로 참가</button>)}
              {inLobby && <button className="btn small danger" onClick={() => send({ t: 'teacher:removeTeam', teamId: t.id })}>팀 삭제</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="panel tight col" style={{ gap: 6 }}>
        <strong>학생 명단 ({students.length}) · 미배정 {free.length}</strong>
        <div className="members">
          {students.length === 0 && <span className="small muted">아직 아무도 없어요. QR을 보여주세요.</span>}
          {students.map((s) => {
            const t = s.teamId ? view.teams.find((x) => x.id === s.teamId) : null;
            return (
              <span key={s.id} className={`member ${s.connected ? '' : 'off'}`} style={t ? { borderLeft: `4px solid ${TEAM_STYLES[t.styleIndex].color}` } : undefined}>
                {s.nick}{t ? ` · ${t.name}` : ''}
                {!t && inLobby && <button className="btn small primary" style={{ minHeight: 24, padding: '0 8px', fontSize: 12 }} onClick={() => send({ t: 'teacher:assignLeader', playerId: s.id })} disabled={view.teams.length >= MAX_TEAMS}>팀장 지정</button>}
                {!t && view.teams.filter((x) => !x.bot).length > 0 && <select className="input" style={{ minHeight: 24, width: 96, padding: '0 6px', fontSize: 12 }} value="" onChange={(e) => e.target.value && send({ t: 'teacher:movePlayer', playerId: s.id, teamId: e.target.value })}><option value="">팀 배정…</option>{view.teams.filter((x) => !x.bot).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
                <button className="btn small ghost" style={{ minHeight: 22, padding: '0 6px', fontSize: 11 }} title="내보내기" onClick={() => setConfirm('kick:' + s.id)}>✕</button>
                {confirm === 'kick:' + s.id && <><button className="btn small danger" style={{ minHeight: 22, fontSize: 11 }} onClick={() => { send({ t: 'teacher:kick', playerId: s.id }); setConfirm(null); }}>내보내기</button><button className="btn small ghost" style={{ minHeight: 22, fontSize: 11 }} onClick={() => setConfirm(null)}>취소</button></>}
              </span>
            );
          })}
        </div>
      </div>
      {inLobby && (
        <div className="row">
          <button className="btn primary big" onClick={() => send({ t: 'teacher:start' })} disabled={view.teams.length < 2}>🏁 대회 시작 ({view.settings.matches}경기)</button>
          <span className="small muted">{view.teams.length < 2 ? '팀이 2개 이상 필요해요' : `${view.teams.length}팀이 한 경기장에서 붙어요`}</span>
          <span className="spacer" />
          <button className="btn ghost small" onClick={onExit}>나가기</button>
        </div>
      )}
    </div>
  );
  if (drawer) return <div className="drawer" role="dialog" aria-label="교사 관제">{body}</div>;
  return body;
}
