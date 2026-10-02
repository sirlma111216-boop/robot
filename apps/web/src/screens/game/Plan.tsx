import React, { useEffect, useMemo, useState } from 'react';
import { ARENAS, COMMAND_IDS, commandCost, planCost, previewPath, deriveSpec, validatePlan, EMOTES, type CommandId, type Plan as PlanT } from '@scrap/core';
import { Scene, TopBar, Timer, CommandCard, CommandIcon, TeamBadge, Speaker, commandLabel } from '../../ui/common';
import { ArenaView } from '../../ui/ArenaView';
import { teamInfosFromView } from '../../render/ArenaRenderer';
import { myTeamOf, type ScreenProps } from './GameFlow';

type Slots = (CommandId | null)[];

export function Plan({ client, view }: ScreenProps) {
  const m = view.match!;
  const arena = ARENAS[m.arenaId];
  const team = myTeamOf(view);
  const isLeader = !!view.me?.isLeader;
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const [sel, setSel] = useState<number>(0);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [tipShown, setTipShown] = useState(() => { try { return localStorage.getItem('sc:tip:plan') !== '1'; } catch { return true; } });
  useEffect(() => { setSlots([null, null, null]); setSel(0); }, [m.turn, m.index]);
  const teams = useMemo(() => teamInfosFromView(view.teams), [view.teams]);
  const myRobot = team ? m.robots.find((r) => r.teamId === team.id) : null;
  const build = team?.build;
  const locked = team?.lockedPlan ?? null;
  const filled = slots.every(Boolean);
  const draft: PlanT = slots.map((s) => s ?? 'BRAKE') as PlanT;
  const preview = useMemo(() => {
    if (!team || !myRobot || !build || myRobot.fallen) return null;
    const p = locked ?? draft;
    if (!locked && !slots.some(Boolean)) return null;
    return previewPath(arena, { id: team.id, spec: deriveSpec(build), x: myRobot.x, y: myRobot.y, angle: myRobot.angle, vx: 0, vy: 0, w: 0, fallen: false, padIndex: myRobot.padIndex }, p);
  }, [arena, team?.id, myRobot?.x, myRobot?.y, myRobot?.angle, JSON.stringify(locked), JSON.stringify(draft)]);
  const cost = build ? planCost(draft, build) : 0;
  const energy = team?.energy ?? 0;
  const lockedCount = view.teams.filter((t) => t.planLocked).length;

  const pick = (c: CommandId) => {
    if (locked) return;
    const next = [...slots]; next[sel] = c; setSlots(next);
    const n = next.findIndex((x, i) => i > sel && !x);
    setSel(n >= 0 ? n : Math.min(2, sel + 1));
  };
  const clearSlot = (i: number) => { if (locked) return; const next = [...slots]; next[i] = null; setSlots(next); setSel(i); };
  const validity = build ? validatePlan(draft, build, energy) : { ok: false as const, reason: '' };
  // 팀장의 배치는 채워질 때마다 자동으로 서버에 전달된다(확정 전에 마감돼도 이 배치가 사용됨)
  useEffect(() => {
    if (!isLeader || locked || !filled || !validity.ok) return;
    const id = setTimeout(() => client.send({ t: 'proposePlan', plan: draft }), 350);
    return () => clearTimeout(id);
  }, [isLeader, locked, filled, validity.ok, JSON.stringify(draft)]);
  const adopt = (p: PlanT) => { setSlots([...p]); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!build || locked) return;
      const map: Record<string, CommandId> = { ArrowUp: 'FWD', ArrowDown: 'BACK', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ' ': 'BRAKE', f: 'FRONT', q: 'UTIL_A', w: 'UTIL_B', '.': 'WAIT' };
      const c = map[e.key]; if (c && commandCost(c, build).cost !== null) { e.preventDefault(); pick(c); }
      if (e.key === 'Backspace') clearSlot(sel);
      if (e.key === 'Enter' && filled && isLeader) client.send({ t: 'lockPlan', plan: draft });
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Scene>
      <TopBar title={`전술 준비실 · ${m.turn}/${m.totalTurns}턴`} sub={`${m.index + 1}경기 ${arena.name}`}>
        <span className="small muted">{lockedCount}/{view.teams.length} 팀 확정</span>
        <Timer deadline={view.deadline} serverNow={() => client.serverNow()} total={view.settings.planSeconds} />
      </TopBar>
      <div style={{ flex: 1, display: 'flex', gap: 10, padding: '0 10px 10px', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <ArenaView arenaId={m.arenaId} teams={teams} myTeamId={team?.id ?? null} robots={m.robots} capsules={m.capsules} crown={m.crown} preview={preview} />
          <div className="hud"><div className="score-strip">{view.teams.map((t) => <span key={t.id} className="score-chip" style={{ borderColor: t.planLocked ? 'var(--teal)' : undefined }}><TeamBadge styleIndex={t.styleIndex} size={18} />{t.name}<span className="pts">{t.matchScore}</span>{t.planLocked ? '🔒' : ''}</span>)}</div></div>
          {myRobot?.fallen && <div className="float-msg">이번 턴은 정비 구역에서 대기 · 다음 턴에 복귀</div>}
        </div>
        {team && build ? (
          <div className="panel col" style={{ width: 400, gap: 10, overflow: 'auto' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row"><TeamBadge styleIndex={team.styleIndex} /><strong>{team.name}</strong></div>
              <span className="tag warn">⚡ {energy - (locked ? 0 : cost)} / {energy}</span>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }} role="group" aria-label="명령 슬롯">
              {(locked ?? slots).map((c, i) => (
                <button key={i} type="button" className={`slot ${c ? 'filled' : ''} ${!locked && sel === i ? 'target' : ''}`} onClick={() => (c ? clearSlot(i) : setSel(i))} aria-label={`슬롯 ${i + 1}: ${c ? commandLabel(c as CommandId, build) : '비어 있음'}`} disabled={!!locked}>
                  <span className="idx">{i + 1} · {i * 3}~{i * 3 + 3}s</span>
                  {c ? <><CommandIcon id={c as CommandId} build={build} /><span style={{ fontSize: 12 }}>{commandLabel(c as CommandId, build)}</span></> : <span className="muted small">{sel === i ? '여기에' : ''}</span>}
                </button>
              ))}
            </div>
            {locked ? (
              <div className="col" style={{ gap: 6, alignItems: 'center' }}>
                <span className="tag ok">🔒 명령 확정됨 · 친구 팀 기다리는 중</span>
                {isLeader && <button className="btn small ghost" onClick={() => client.send({ t: 'unlockPlan' })}>수정하기</button>}
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
                  {COMMAND_IDS.map((id) => <CommandCard key={id} id={id} build={build} onClick={() => pick(id)} disabled={!!myRobot?.fallen} />)}
                </div>
                {!validity.ok && filled && <div className="tag danger small">{validity.reason}</div>}
                {isLeader ? (
                  <button className="btn primary big block" disabled={!filled || !validity.ok || !!myRobot?.fallen} onClick={() => client.send({ t: 'lockPlan', plan: draft })}>명령 확정 🔒</button>
                ) : (
                  <button className="btn teal big block" disabled={!filled || !validity.ok} onClick={() => { client.send({ t: 'proposePlan', plan: draft }); client.toast('팀장에게 제안했어요'); }}>팀장에게 제안하기</button>
                )}
                {isLeader && filled && validity.ok && <div className="small" style={{ textAlign: 'center', color: 'var(--teal)' }}>확정을 안 눌러도 마감 때 이 배치로 진행돼요. 확정하면 더 빨리 시작!</div>}
                <div className="small muted" style={{ textAlign: 'center' }}>키보드: ↑↓←→ 이동 · 스페이스 제동 · F 전면 · Q/W 보조 · Backspace 지우기{isLeader ? ' · Enter 확정' : ''}</div>
              </>
            )}
            {team.proposals && team.proposals.filter((q) => q.by !== view.me!.playerId).length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <strong className="small">팀원 제안 ({team.proposals.filter((q) => q.by !== view.me!.playerId).length})</strong>
                {team.proposals.filter((q) => q.by !== view.me!.playerId).map((q) => {
                  const who = team.members.find((mm) => mm.id === q.by)?.nick ?? '?';
                  const voted = q.votes.includes(view.me!.playerId);
                  return (
                    <div key={q.id} className="row" style={{ gap: 6, padding: '4px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
                      <span className="small" style={{ width: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</span>
                      {q.plan.map((c, i) => <span key={i} style={{ width: 26, height: 26, color: '#fff' }} title={commandLabel(c, build)}><CommandIcon id={c} build={build} /></span>)}
                      <span className="tag small">👍 {q.votes.length}</span>
                      <span className="spacer" />
                      <button className={`btn small ${voted ? 'teal' : 'ghost'}`} onClick={() => client.send({ t: 'votePlan', proposalId: q.id })}>{voted ? '투표함' : '투표'}</button>
                      {isLeader && !locked && <button className="btn small primary" onClick={() => adopt(q.plan)}>채택</button>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="row" style={{ marginTop: 'auto', justifyContent: 'space-between' }}>
              <span className="small muted">팀원 {team.members.length}명</span>
              <div className="row" style={{ gap: 4 }}>
                {emoteOpen ? EMOTES.map((e) => <button key={e} className="btn small" onClick={() => { client.send({ t: 'emote', emote: e }); setEmoteOpen(false); }}>{e}</button>) : <button className="btn small ghost" onClick={() => setEmoteOpen(true)}>이모트</button>}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel col" style={{ width: 300, gap: 8 }}>
            <strong>관전 중</strong>
            <span className="small muted">팀들이 명령을 정하는 중이에요. 확정된 명령은 전투가 시작될 때 공개돼요.</span>
            {view.teams.map((t) => <div key={t.id} className="row small"><TeamBadge styleIndex={t.styleIndex} size={20} /><span style={{ flex: 1 }}>{t.name}</span><span className={`tag ${t.planLocked ? 'ok' : ''}`}>{t.planLocked ? '확정' : '계획 중'}</span><span className="muted">⚡{t.energy}</span></div>)}
          </div>
        )}
      </div>
      {tipShown && team && m.turn === 1 && <Speaker who="정비사 미라" image="CH-01" text={isLeader ? '카드를 눌러 3칸을 채우고 「명령 확정」을 눌러! 3초씩, 모두 동시에 움직여.' : '카드로 3칸을 채워 팀장에게 제안해 봐. 팀장이 채택하면 우리 팀 명령이 돼.'} style={{ left: 16, bottom: 12 }} onSkip={() => { setTipShown(false); try { localStorage.setItem('sc:tip:plan', '1'); } catch { /* noop */ } }} />}
    </Scene>
  );
}
