import { useEffect, useMemo, useState } from 'react';
import { ARENAS, type CommandId } from '@scrap/core';
import { Scene, TopBar, TeamBadge, CommandIcon, commandLabel, josa } from '../../ui/common';
import { ArenaView } from '../../ui/ArenaView';
import { teamInfosFromView } from '../../render/ArenaRenderer';
import { myTeamOf, type ScreenProps } from './GameFlow';

export function Battle({ client, state, view }: ScreenProps) {
  const m = view.match!;
  const arena = ARENAS[m.arenaId];
  const team = myTeamOf(view);
  const teams = useMemo(() => teamInfosFromView(view.teams), [view.teams]);
  const segment = m.segmentId ? state.segments[m.segmentId] : undefined;
  const [slot, setSlot] = useState(-1);
  const [ended, setEnded] = useState(false);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [reduceFx] = useState(() => { try { return localStorage.getItem('sc:reduceFx') === '1'; } catch { return false; } });
  useEffect(() => { setSlot(-1); setEnded(false); setDeltas({}); }, [m.segmentId]);
  useEffect(() => { if (m.segmentId && !segment) client.send({ t: 'getSegment', segmentId: m.segmentId }); }, [m.segmentId, !!segment]);
  useEffect(() => {
    if (!team) return;
    if (team.planSource === 'safe') client.toast('명령을 확정하지 않아 이번 턴은 제동으로 진행했어요. 다음 턴엔 3칸을 채워요!', 'error');
    else if (team.planSource === 'leader') client.toast('확정 전에 마감돼서 마지막 배치로 진행했어요');
    else if (team.planSource === 'vote') client.toast('팀장이 확정하지 않아 팀원 최다 득표 제안으로 진행했어요');
  }, [m.segmentId]);

  const playback = useMemo(() => segment && m.segmentId && m.startAt ? {
    segmentId: m.segmentId, segment, startAt: m.startAt, serverNow: () => client.serverNow(),
    hooks: { onSlot: (i: number) => setSlot(i), onEnd: () => setEnded(true), onScore: (id: string, d: number) => setDeltas((x) => ({ ...x, [id]: (x[id] ?? 0) + d })) },
  } : null, [segment, m.segmentId, m.startAt]);

  const myPlan = team ? m.revealedPlans[team.id] : undefined;
  const summary = useMemo(() => {
    if (!segment) return '';
    const name = (id: string) => view.teams.find((t) => t.id === id)?.name ?? '?';
    const crown = segment.events.find((e) => e.type === 'crown') as { id: string | null; contested: string[] } | undefined;
    const falls = segment.events.filter((e) => e.type === 'fall') as { id: string; by?: string }[];
    const parts: string[] = [];
    if (crown?.id) parts.push(`👑 ${name(crown.id)} 왕관 차지 +3`); else if (crown && crown.contested.length > 1) parts.push('왕관 경합으로 아무도 점수 없음');
    for (const f of falls) parts.push(f.by ? `${josa(name(f.by), '이', '가')} ${josa(name(f.id), '을', '를')} 떨어뜨림 +2` : `${name(f.id)} 스스로 낙하`);
    return parts.join(' · ') || '조용한 턴. 다음 턴을 노려!';
  }, [segment]);

  return (
    <Scene>
      <TopBar title={`경기장 중계 · ${m.turn}/${m.totalTurns}턴`} sub={`${m.index + 1}경기 ${arena.name}`}>
        <span className="tag">{slot < 0 ? '전투 시작 준비…' : ended ? '결과 정리' : `${slot + 1}번 명령 실행 중`}</span>
      </TopBar>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', padding: '0 10px 10px' }}>
        <ArenaView arenaId={m.arenaId} teams={teams} myTeamId={team?.id ?? null} robots={m.robots} capsules={m.capsules} crown={m.crown} playback={playback} reduceFx={reduceFx} />
        <div className="hud">
          <div className="score-strip">
            {view.teams.map((t) => <span key={t.id} className="score-chip"><TeamBadge styleIndex={t.styleIndex} size={18} />{t.name}<span className="pts">{t.matchScore - (m.turnScores[t.id] ?? 0) + (deltas[t.id] ?? 0)}</span>{deltas[t.id] ? <span style={{ color: 'var(--ok)' }}>+{deltas[t.id]}</span> : null}</span>)}
          </div>
        </div>
        {!segment && <div className="float-msg">재생 자료 받는 중…</div>}
        {ended && <div className="float-msg" style={{ top: '10%', fontSize: 18, maxWidth: '80%' }}>📣 볼트: {summary}</div>}
        {myPlan && (
          <div className="slot-strip" aria-label="우리 팀 명령 진행">
            {myPlan.map((c, i) => <div key={i} className={`slot filled ${slot === i && !ended ? 'active' : ''}`} style={{ opacity: slot > i || ended ? 0.55 : 1 }}><span className="idx">{i + 1}</span><CommandIcon id={c as CommandId} build={team!.build} /><span style={{ fontSize: 11 }}>{commandLabel(c as CommandId, team!.build)}</span></div>)}
          </div>
        )}
      </div>
    </Scene>
  );
}
