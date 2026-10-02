import { ARENAS, ALL_PARTS, TEAM_STYLES } from '@scrap/core';
import { Scene, TopBar, Timer, RobotPreview, TeamBadge, Speaker } from '../../ui/common';
import type { ScreenProps } from './GameFlow';

export function Intro({ client, view }: ScreenProps) {
  const arena = view.match ? ARENAS[view.match.arenaId] : null;
  return (
    <Scene bg="BG-05">
      <TopBar title={`${(view.match?.index ?? 0) + 1}경기 · ${arena?.name ?? ''}`} sub={arena?.subtitle}><Timer deadline={view.deadline} serverNow={() => client.serverNow()} total={view.settings.introSeconds} /></TopBar>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 24px' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 12, alignItems: 'flex-end' }}>
          {view.teams.map((t, i) => (
            <div key={t.id} className="panel tight col" style={{ width: 170, alignItems: 'center', gap: 4, borderTop: `5px solid ${TEAM_STYLES[t.styleIndex % TEAM_STYLES.length].color}`, animation: `rise 0.5s ${i * 0.12}s both`, boxShadow: view.me?.teamId === t.id ? '0 0 0 3px var(--amber)' : undefined }}>
              <RobotPreview build={t.build} styleIndex={t.styleIndex} number={t.styleIndex + 1} size={130} />
              <div className="row" style={{ gap: 6 }}><TeamBadge styleIndex={t.styleIndex} size={20} /><strong>{t.name}</strong></div>
              <span className="small muted">팀장 {t.leaderNick}</span>
              <span className="small muted" style={{ textAlign: 'center' }}>{ALL_PARTS[t.build.chassis]?.name} · {ALL_PARTS[t.build.front]?.name}</span>
            </div>
          ))}
        </div>
      </div>
      <Speaker who="방송 드론 볼트" image="CH-02" text={`${arena?.name ?? '경기장'}에 ${view.teams.length}팀이 입장합니다! 6턴, 매 턴 3개 명령. 왕관을 차지하라!`} style={{ left: 16, bottom: 12 }} />
      <style>{`@keyframes rise { from { transform: translateY(40px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </Scene>
  );
}
