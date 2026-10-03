import { useEffect, useState } from 'react';
import { ALL_PARTS, CHASSIS, DRIVES, FRONTS, UTILITIES, PRESETS, MASS_BUDGET, ARENAS, buildMass, validateBuild, deriveSpec, type RobotBuild, type PartKind } from '@scrap/core';
import { Scene, TopBar, Timer, Speaker, PartCard, RobotPreview, TeamBadge, josa } from '../../ui/common';
import { assetUrl } from '../../assets/loader';
import { myTeamOf, type ScreenProps } from './GameFlow';

type SlotKey = 'chassis' | 'drive' | 'front' | 'utilA' | 'utilB';
const SLOT_LABEL: Record<SlotKey, string> = { chassis: '섀시', drive: '주행 장치', front: '전면 장치', utilA: '보조 1', utilB: '보조 2' };
const KIND_OF: Record<SlotKey, PartKind> = { chassis: 'chassis', drive: 'drive', front: 'front', utilA: 'utility', utilB: 'utility' };

export function Build(props: ScreenProps) {
  const { client, view, mode } = props;
  const pit = view.phase === 'PITSTOP';
  const team = myTeamOf(view);
  const isLeader = !!view.me?.isLeader;
  const [local, setLocal] = useState<RobotBuild | null>(null);
  const [market, setMarket] = useState<SlotKey | null>(null);
  const [tipShown, setTipShown] = useState(() => { try { return localStorage.getItem('sc:tip:build') !== '1'; } catch { return true; } });
  const build = local ?? team?.build ?? PRESETS[0].build;
  useEffect(() => { setLocal(null); }, [team?.id, view.phase]);
  const arena = view.match ? ARENAS[view.match.arenaId] : null;
  const total = pit ? view.settings.pitstopSeconds : view.settings.buildSeconds;

  // 조립 확정은 팀장만: 팀원 화면이 서버 상태와 어긋나지 않게 팀원은 로컬로도 바꾸지 않는다
  const commit = (b: RobotBuild) => { if (!isLeader) return; setLocal(b); client.send({ t: 'setBuild', build: b }); };
  const setPart = (slot: SlotKey, id: string | null) => {
    const b: RobotBuild = { ...build, utilities: [...build.utilities] };
    if (slot === 'chassis' && id) b.chassis = id; else if (slot === 'drive' && id) b.drive = id; else if (slot === 'front' && id) b.front = id;
    else if (slot === 'utilA' || slot === 'utilB') { const i = slot === 'utilA' ? 0 : 1; if (id) { if (b.utilities.includes(id) && b.utilities[i] !== id) return; b.utilities[i] = id; } else b.utilities.splice(i, 1); b.utilities = b.utilities.filter(Boolean); }
    commit(b); setMarket(null);
  };
  const mass = buildMass(build);
  const valid = validateBuild(build);
  const spec = valid.ok ? deriveSpec(build) : null;

  // 관전(팀 없음 / 교사 미참가): 모든 팀 조립 현황
  if (!team) {
    return (
      <Scene bg={pit ? 'BG-06' : 'BG-04'} dim>
        <TopBar title={pit ? '피트스톱' : '조립 중'} sub={arena ? `${view.match!.index + 1}경기 · ${arena.name}` : ''}><Timer deadline={view.deadline} serverNow={() => client.serverNow()} total={total} /></TopBar>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div className="hangar-grid">{view.teams.map((t) => <div key={t.id} className="door"><div className="head"><TeamBadge styleIndex={t.styleIndex} /><span className="name">{t.name}</span><span className={`tag ${t.buildReady ? 'ok' : ''}`}>{t.buildReady ? '준비 완료' : '조립 중'}</span></div><div style={{ alignSelf: 'center' }}><RobotPreview build={t.build} styleIndex={t.styleIndex} number={t.styleIndex + 1} size={130} /></div><div className="small muted">{[t.build.chassis, t.build.drive, t.build.front, ...t.build.utilities].map((id) => ALL_PARTS[id]?.name).join(' · ')}</div></div>)}</div>
        </div>
      </Scene>
    );
  }

  const slotValue = (s: SlotKey) => s === 'chassis' ? build.chassis : s === 'drive' ? build.drive : s === 'front' ? build.front : build.utilities[s === 'utilA' ? 0 : 1] ?? null;
  const last = pit ? view.history[view.history.length - 1] : null;

  return (
    <Scene bg={pit ? 'BG-06' : 'BG-04'}>
      <TopBar title={pit ? '피트스톱 · 부품 교체' : '팀 정비소 · 로봇 조립'} sub={arena ? `${view.match!.index + 1}경기 ${arena.name} — ${arena.subtitle}` : ''}>
        <span className="tag"><TeamBadge styleIndex={team.styleIndex} size={20} /> {team.name}{isLeader ? ' · 팀장' : ''}</span>
        <Timer deadline={view.deadline} serverNow={() => client.serverNow()} total={total} />
      </TopBar>
      <div style={{ flex: 1, display: 'flex', gap: 12, padding: '0 12px 12px', minHeight: 0 }}>
        {/* 좌: 장착 슬롯 */}
        <div className="panel col" style={{ width: 250, gap: 8, overflow: 'auto' }}>
          <strong>장착 위치</strong>
          {(['chassis', 'drive', 'front', 'utilA', 'utilB'] as SlotKey[]).map((s) => {
            const v = slotValue(s); const p = v ? ALL_PARTS[v] : null;
            return (
              <button key={s} className="btn" style={{ justifyContent: 'flex-start', gap: 10, minHeight: 56, background: market === s ? 'rgba(255,184,77,0.2)' : undefined }} onClick={() => setMarket(s)} aria-label={`${SLOT_LABEL[s]}: ${p?.name ?? '비어 있음'}`}>
                {p ? <img src={assetUrl(p.id)} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} /> : <span style={{ width: 40, height: 40, borderRadius: 8, border: '2px dashed var(--line)', display: 'inline-block' }} />}
                <span className="col" style={{ gap: 0, alignItems: 'flex-start' }}><span className="small muted">{SLOT_LABEL[s]}</span><span>{p?.name ?? (s.startsWith('util') ? '(선택)' : '없음')}</span></span>
              </button>
            );
          })}
          <div className="divider" />
          <div className="small">무게 <strong style={{ color: mass > MASS_BUDGET ? 'var(--danger)' : 'var(--teal)' }}>{mass}</strong> / {MASS_BUDGET}</div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4 }}><div style={{ height: '100%', width: `${Math.min(100, (mass / MASS_BUDGET) * 100)}%`, background: mass > MASS_BUDGET ? 'var(--danger)' : 'var(--teal)', borderRadius: 4 }} /></div>
          {spec && <div className="small muted">에너지 {spec.energyMax} (+{spec.energyRegen}/턴) · 가속 {(spec.engineForce / spec.mass).toFixed(0)} · 접지 {spec.grip.toFixed(1)}</div>}
          {!valid.ok && <div className="tag danger small">{valid.reason}</div>}
          <div className="divider" />
          <span className="small muted">프리셋</span>
          <div className="col" style={{ gap: 6 }}>{PRESETS.map((p) => <button key={p.id} className="btn small" style={{ justifyContent: 'flex-start' }} disabled={!isLeader} onClick={() => commit({ ...p.build, utilities: [...p.build.utilities] })} title={p.short}>{p.name}</button>)}</div>
        </div>
        {/* 중: 조립대 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, position: 'relative' }}>
          <div style={{ width: 'min(46vh, 380px)', height: 'min(46vh, 380px)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,215,200,0.18), rgba(10,18,34,0.6) 70%)', boxShadow: '0 0 0 4px rgba(47,215,200,0.25), 0 20px 50px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RobotPreview build={build} styleIndex={team.styleIndex} number={team.styleIndex + 1} size={Math.min(window.innerHeight * 0.44, 360)} />
          </div>
          {!isLeader && <div className="panel tight small" style={{ textAlign: 'center' }}>팀장 <strong>{team.leaderNick}</strong>{josa(team.leaderNick, '이', '가').slice(team.leaderNick.length)} 조립 중이에요. 부품을 눌러 <strong>추천</strong>할 수 있어요.</div>}
          {isLeader && team.suggestions && team.suggestions.length > 0 && (
            <div className="panel tight row small"><span className="muted">팀원 추천:</span>{team.suggestions.map((s, i) => { const who = team.members.find((m) => m.id === s.by)?.nick ?? '?'; const p = ALL_PARTS[s.partId]; return p ? <button key={i} className="tag" onClick={() => { const slot: SlotKey = p.kind === 'chassis' ? 'chassis' : p.kind === 'drive' ? 'drive' : p.kind === 'front' ? 'front' : (build.utilities.length < 2 && !build.utilities.includes(p.id) ? (build.utilities.length === 0 ? 'utilA' : 'utilB') : 'utilA'); setPart(slot, p.id); }}>{who}: {p.name} ➕</button> : null; })}</div>
          )}
        </div>
        {/* 우: 정보/준비 */}
        <div className="panel col" style={{ width: 260, gap: 10, overflow: 'auto' }}>
          {last && (
            <div className="col" style={{ gap: 4 }}>
              <strong>지난 경기 결과</strong>
              {last.standings.map((s) => { const t = view.teams.find((x) => x.id === s.teamId); return t ? <div key={s.teamId} className="row small" style={{ gap: 6 }}><TeamBadge styleIndex={t.styleIndex} size={20} /><span style={{ flex: 1 }}>{t.name}</span><span>{s.rank}위 · {s.score}점 · +{s.points}pt</span></div> : null; })}
              <div className="divider" />
            </div>
          )}
          {arena && <div className="col" style={{ gap: 2 }}><strong>{pit ? '다음' : '이번'} 경기장: {arena.name}</strong><span className="small muted">{arena.subtitle}</span><span className="small muted">낙하 구역 {arena.pits.length}곳{arena.conveyors.length ? ` · 컨베이어 ${arena.conveyors.length}` : ''}{arena.slick.length ? ` · 미끄럼 바닥 ${arena.slick.length}` : ''}</span></div>}
          <div className="divider" />
          <strong>규칙 한눈에</strong>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}><li>전투가 끝날 때 <b>왕관 곁(노란 원)</b>에 혼자 있으면 <b style={{ color: 'var(--amber)' }}>3점</b></li><li>왕관은 부딪히면 튕겨 나가요. 밀고, 쏘고, 자석으로 끌어 보세요</li><li>여러 대가 연달아 부딪히면 <b>연쇄</b>로 더 세게 튕겨요</li><li>상대를 낙하 구역에 밀어 넣으면 <b style={{ color: 'var(--amber)' }}>2점</b></li><li>고철 캡슐을 주우면 <b style={{ color: 'var(--amber)' }}>1점</b></li><li>떨어져도 다음 턴에 돌아와요. 탈락은 없어요</li></ul>
          <div className="divider" />
          <div className="small muted">팀원: {team.members.map((m) => m.nick).join(', ') || '없음'}</div>
          <div style={{ marginTop: 'auto' }}>
            {isLeader ? (
              <button className={`btn big block ${team.buildReady ? 'teal' : 'primary'}`} disabled={!valid.ok} onClick={() => client.send({ t: 'ready', ready: !team.buildReady })}>{team.buildReady ? '✔ 준비 완료 (취소)' : '준비 완료!'}</button>
            ) : <div className="tag" style={{ width: '100%', justifyContent: 'center' }}>{team.buildReady ? '✔ 우리 팀 준비 완료' : '팀장이 조립 중'}</div>}
            <div className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>{view.teams.filter((t) => t.buildReady).length}/{view.teams.length} 팀 준비</div>
          </div>
        </div>
      </div>
      {market && (
        <div className="overlay" onClick={() => setMarket(null)}>
          <div className="scene" style={{ width: 'min(1100px, 100%)', height: 'min(640px, 100%)', borderRadius: 16, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <Scene bg="BG-03">
              <TopBar title={`고철 경매장 · ${SLOT_LABEL[market]} 고르기`}>{isLeader && (market === 'utilA' || market === 'utilB') && slotValue(market) && <button className="btn small ghost" onClick={() => setPart(market, null)}>비우기</button>}<button className="btn small ghost" onClick={() => setMarket(null)}>닫기 ✕</button></TopBar>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 20px 40px' }}>
                <div className="row" style={{ gap: 14, justifyContent: 'center', alignItems: 'stretch' }}>
                  {Object.values(KIND_OF[market] === 'chassis' ? CHASSIS : KIND_OF[market] === 'drive' ? DRIVES : KIND_OF[market] === 'front' ? FRONTS : UTILITIES).map((p) => {
                    const current = slotValue(market) === p.id;
                    const otherUtil = (market === 'utilA' || market === 'utilB') && build.utilities.includes(p.id) && !current;
                    const trial: RobotBuild = { ...build, utilities: [...build.utilities] };
                    if (market === 'chassis') trial.chassis = p.id; else if (market === 'drive') trial.drive = p.id; else if (market === 'front') trial.front = p.id; else { const i = market === 'utilA' ? 0 : 1; trial.utilities[i] = p.id; }
                    const over = buildMass(trial) > MASS_BUDGET;
                    return <div key={p.id} style={{ width: 190 }}><PartCard id={p.id} selected={current} disabled={otherUtil} note={over ? '무게 초과' : undefined} onClick={() => { if (isLeader) setPart(market, p.id); else { client.send({ t: 'suggestPart', partId: p.id }); client.toast(`${josa(p.name, '을', '를')} 팀장에게 추천했어요`); setMarket(null); } }} /><div className="small muted" style={{ textAlign: 'center', marginTop: 4 }}>{p.short}</div></div>;
                  })}
                </div>
              </div>
            </Scene>
          </div>
        </div>
      )}
      {tipShown && mode !== 'teacher' && <Speaker who="정비사 미라" image="CH-01" text={isLeader ? '왼쪽 칸을 눌러 부품을 갈아 끼우고, 준비 완료를 눌러. 무게 한도를 넘기면 안 돼!' : '부품을 눌러 팀장에게 추천해 줘. 팀장 화면에 네 이름과 함께 떠!'} style={{ left: 270, bottom: 10 }} onSkip={() => { setTipShown(false); try { localStorage.setItem('sc:tip:build', '1'); } catch { /* noop */ } }} />}
    </Scene>
  );
}
