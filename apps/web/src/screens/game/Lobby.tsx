import { useState } from 'react';
import { TEAM_STYLES } from '@scrap/core';
import { Scene, TopBar, Speaker, TeamBadge, RobotPreview } from '../../ui/common';
import { TeacherConsole } from './TeacherConsole';
import { myTeamOf, type ScreenProps } from './GameFlow';

export function Lobby(props: ScreenProps) {
  const { client, view, mode, onExit } = props;
  const [rename, setRename] = useState(''); // 훅은 조건부 return 보다 먼저
  if (mode === 'teacher') {
    return (
      <Scene bg="BG-08">
        <TopBar title="스크랩 크라운" sub="교사 관제실" />
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}><div className="panel" style={{ maxWidth: 1100, margin: '0 auto' }}><TeacherConsole {...props} /></div></div>
      </Scene>
    );
  }
  const me = view.me!;
  const myTeam = myTeamOf(view);
  const free = view.players.filter((p) => p.role === 'student' && !p.teamId);
  return (
    <Scene bg="BG-02">
      <TopBar title="클래스 격납고" sub={`코드 ${view.code}`}>
        <span className="tag">{me.nick}{me.isLeader ? ' ★ 팀장' : ''}</span>
        <button className="btn ghost small" onClick={onExit}>나가기</button>
      </TopBar>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 90px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="panel tight" style={{ textAlign: 'center' }}>
          {view.teams.length === 0 ? <><strong>선생님이 팀장을 정하는 중이에요.</strong><div className="small muted">팀장이 정해지면 격납고 문이 열려요.</div></>
            : myTeam ? <><strong>{myTeam.name} 팀에 들어왔어요.</strong><div className="small muted">{me.isLeader ? '팀장은 조립과 명령 확정을 맡아요. 팀원들의 추천과 제안을 잘 들어 보세요!' : '팀원은 부품을 추천하고 명령안을 제안해요. 팀장이 최종 확정!'} 선생님이 시작하면 조립이 시작돼요.</div></>
              : <><strong>들어갈 팀을 고르세요.</strong><div className="small muted">문을 눌러 팀에 들어가요. 정원: 팀당 {view.settings.maxTeamSize}명</div></>}
        </div>
        <div className="hangar-grid">
          {view.teams.map((t) => {
            const humans = t.members.length;
            const full = humans >= view.settings.maxTeamSize;
            const mine = myTeam?.id === t.id;
            return (
              <div key={t.id} className={`door ${mine ? 'mine' : ''}`} style={{ borderTopColor: TEAM_STYLES[t.styleIndex].color, borderTopWidth: 5 }}>
                <div className="head"><TeamBadge styleIndex={t.styleIndex} /><span className="name">{t.name}</span>{t.bot && <span className="tag">봇</span>}</div>
                <div style={{ alignSelf: 'center', margin: '-6px 0' }}><RobotPreview build={t.build} styleIndex={t.styleIndex} number={t.styleIndex + 1} size={110} /></div>
                <div className="members">
                  {t.bot ? <span className="member leader">🤖 {t.bot.name}</span> : t.members.map((m) => <span key={m.id} className={`member ${m.id === t.leaderId ? 'leader' : ''} ${m.connected ? '' : 'off'}`}>{m.id === t.leaderId ? '★ ' : ''}{m.nick}</span>)}
                  {!t.bot && t.members.length === 0 && <span className="small muted">비어 있음</span>}
                </div>
                <div className="row" style={{ marginTop: 'auto' }}>
                  {!t.bot && !mine && !me.isLeader && <button className="btn small primary" disabled={full} onClick={() => client.send({ t: 'joinTeam', teamId: t.id })}>{full ? '정원 초과' : '이 팀에 들어가기'}</button>}
                  {mine && !me.isLeader && <button className="btn small ghost" onClick={() => client.send({ t: 'leaveTeam' })}>팀 나가기</button>}
                  {mine && me.isLeader && (
                    <form className="row" onSubmit={(e) => { e.preventDefault(); if (rename.trim()) { client.send({ t: 'renameTeam', name: rename.trim() }); setRename(''); } }}>
                      <input className="input" style={{ width: 120, minHeight: 34 }} placeholder="팀 이름 바꾸기" value={rename} onChange={(e) => setRename(e.target.value)} maxLength={12} /><button className="btn small" type="submit">✔</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {free.length > 0 && <div className="panel tight small muted">대기 중: {free.map((p) => p.nick).join(', ')}</div>}
      </div>
      <Speaker who="방송 드론 볼트" image="CH-02" text={view.teams.length ? '팀이 모이면 선생님이 대회를 시작해! 팀장은 조립대에서 만나자.' : '선생님이 팀장을 정하면 격납고 문이 열려. 잠깐만!'} style={{ right: 16, bottom: 8 }} />
    </Scene>
  );
}
