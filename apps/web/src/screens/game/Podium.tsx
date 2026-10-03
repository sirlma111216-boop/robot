import { ARENAS } from '@scrap/core';
import { Scene, TopBar, RobotPreview, TeamBadge, Speaker } from '../../ui/common';
import type { ScreenProps } from './GameFlow';

export function Podium({ client, view, mode, onExit }: ScreenProps) {
  const st = view.standings;
  const teamOf = (id: string) => view.teams.find((t) => t.id === id)!;
  const winner = st[0] ? teamOf(st[0].teamId) : null;
  const myTeamId = view.me?.teamId;
  const myRank = st.find((s) => s.teamId === myTeamId)?.rank;
  const podiumPos = [{ left: '50%', bottom: '34%', size: 200 }, { left: '25%', bottom: '28%', size: 160 }, { left: '75%', bottom: '28%', size: 160 }];
  return (
    <Scene bg="BG-07">
      <TopBar title="시상대" sub="대회 결과">
        {mode === 'teacher' && <button className="btn primary" onClick={() => client.send({ t: 'teacher:reset' })}>대기실로 · 다시 하기</button>}
        {mode === 'solo' && <button className="btn primary" onClick={onExit}>다시 하기</button>}
        <button className="btn ghost small" onClick={onExit}>나가기</button>
      </TopBar>
      <div style={{ flex: 1, position: 'relative' }}>
        {st.slice(0, 3).map((s, i) => { const t = teamOf(s.teamId); const p = podiumPos[i]; return (
          <div key={s.teamId} style={{ position: 'absolute', left: p.left, bottom: p.bottom, transform: 'translate(-50%, 0)', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: `rise 0.6s ${i * 0.2}s both` }}>
            <div style={{ fontSize: 30 }}>{['🥇', '🥈', '🥉'][s.rank - 1] ?? ''}</div>
            <RobotPreview build={t.build} styleIndex={t.styleIndex} number={t.styleIndex + 1} size={p.size} angle={-0.3 + i * 0.3} />
            <div className="panel tight row" style={{ gap: 6 }}><TeamBadge styleIndex={t.styleIndex} size={20} /><strong>{t.name}</strong><span className="tag warn">{s.rankPoints}pt</span></div>
          </div>
        ); })}
        <div className="panel col" style={{ position: 'absolute', right: 16, top: 12, width: 'min(420px, 45%)', gap: 8, maxHeight: '80%', overflow: 'auto' }}>
          <h2 style={{ fontSize: 20 }}>{winner ? `🏆 ${winner.name} 우승!` : '결과'}</h2>
          {myRank && <span className="tag">우리 팀 {myRank}위</span>}
          <table className="table">
            <thead><tr><th>순위</th><th>팀</th>{view.history.map((h) => <th key={h.index}>{ARENAS[h.arenaId]?.name.slice(0, 4)}</th>)}<th>포인트</th></tr></thead>
            <tbody>
              {st.map((s) => { const t = teamOf(s.teamId); return (
                <tr key={s.teamId} style={s.teamId === myTeamId ? { background: 'rgba(255,184,77,0.12)' } : undefined}>
                  <td>{s.rank}</td>
                  <td><span className="row" style={{ gap: 6 }}><TeamBadge styleIndex={t.styleIndex} size={20} />{t.name}</span></td>
                  {view.history.map((h) => { const r = h.standings.find((x) => x.teamId === s.teamId); return <td key={h.index}>{r ? `${r.score}점 (${r.rank}위)` : '-'}</td>; })}
                  <td><strong>{s.rankPoints}</strong> <span className="muted small">/ 총 {s.totalScore}점</span></td>
                </tr>
              ); })}
            </tbody>
          </table>
          <div className="small muted">점수 근거: 왕관 곁 단독 3점 · 낙하 기여 2점 · 캡슐 1점. 경기마다 순위에 따라 포인트(pt)를 받고 합산해요(6팀이면 1위부터 7·5·4·3·2·1pt).</div>
          {mode === 'student' && <span className="small muted">선생님이 다시 시작하면 격납고로 돌아가요.</span>}
        </div>
        <Speaker who="라이벌 렉스" image="CH-03" text={winner && winner.id === myTeamId ? '…인정. 다음엔 내가 이긴다.' : '역시 왕관은 아무나 못 쓰지. 다시 도전해 봐!'} style={{ left: 16, bottom: 12 }} />
      </div>
      <style>{`@keyframes rise { from { transform: translate(-50%, 40px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }`}</style>
    </Scene>
  );
}
