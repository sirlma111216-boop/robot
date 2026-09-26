import { describe, it, expect } from 'vitest';
import { ClassHost } from '../packages/core/src/host/ClassHost';

describe('ClassHost 대회 흐름', () => {
  it('교사가 클래스를 만들고 팀장 지정 → 봇 팀 추가 → 3경기 대회가 시상대까지 진행된다', () => {
    let now = 1_000_000;
    const host = new ClassHost({ code: 'ABC123', now, seed: 42, teacherId: 'teacher' });
    const s1 = host.joinStudent('민지', now); const s2 = host.joinStudent('민지', now); const s3 = host.joinStudent('철수', now);
    if (!s1.ok || !s2.ok || !s3.ok) throw new Error('join failed');
    expect(host.state.players[s2.playerId].nick).toBe('민지2');
    // 팀장 지정 → 팀 자동 생성
    expect(host.handle('teacher', { t: 'teacher:assignLeader', playerId: s1.playerId }, now)).toEqual({ ok: true });
    expect(host.handle('teacher', { t: 'teacher:assignLeader', playerId: s3.playerId }, now)).toEqual({ ok: true });
    expect(host.state.teamOrder.length).toBe(2);
    const teamA = host.state.teamOrder[0];
    // 팀원 참여
    expect(host.handle(s2.playerId, { t: 'joinTeam', teamId: teamA }, now)).toEqual({ ok: true });
    // 학생이 교사 명령 위조 → 거부
    expect(host.handle(s2.playerId, { t: 'teacher:start' }, now).ok).toBe(false);
    // 봇 팀 2개 추가
    host.handle('teacher', { t: 'teacher:addBotTeam', level: 'normal' }, now);
    host.handle('teacher', { t: 'teacher:addBotTeam', level: 'hard' }, now);
    expect(host.state.teamOrder.length).toBe(4);
    // 시작
    expect(host.handle('teacher', { t: 'teacher:start' }, now)).toEqual({ ok: true });
    expect(host.state.phase).toBe('BUILD');
    // 팀원은 조립 불가, 팀장은 가능
    const build = { chassis: 'RB-03', drive: 'DR-03', front: 'MD-02', utilities: ['MD-04'] };
    expect(host.handle(s2.playerId, { t: 'setBuild', build }, now).ok).toBe(false);
    expect(host.handle(s1.playerId, { t: 'setBuild', build }, now)).toEqual({ ok: true });
    expect(host.handle(s1.playerId, { t: 'setBuild', build: { ...build, utilities: ['MD-04', 'MD-07'] } }, now).ok).toBe(false); // 질량 초과
    // 준비 완료 → 자동 조기 진행
    host.handle(s1.playerId, { t: 'ready', ready: true }, now);
    host.handle(s3.playerId, { t: 'ready', ready: true }, now);
    now += 2000; expect(host.tick(now)).toBe(true); expect(host.state.phase).toBe('INTRO');
    now = host.nextWakeAt()!; host.tick(now); expect(host.state.phase).toBe('PLAN');
    expect(host.state.match!.turn).toBe(1);
    // 팀원 제안, 팀장 확정
    expect(host.handle(s2.playerId, { t: 'proposePlan', plan: ['FWD', 'FWD', 'BRAKE'] }, now)).toEqual({ ok: true });
    expect(host.handle(s2.playerId, { t: 'lockPlan', plan: ['FWD', 'FWD', 'BRAKE'] }, now).ok).toBe(false);
    expect(host.handle(s1.playerId, { t: 'lockPlan', plan: ['FWD', 'FRONT', 'BRAKE'] }, now)).toEqual({ ok: true });
    // 뷰: 다른 팀의 확정 명령은 보이지 않고, 내 팀 제안만 보인다
    const v = host.viewFor(s3.playerId, now);
    const ta = v.teams.find((t) => t.id === teamA)!;
    expect(ta.planLocked).toBe(true); expect(ta.lockedPlan).toBeUndefined(); expect(ta.proposals).toBeUndefined();
    expect(v.match!.revealedPlans).toEqual({});
    // 마감 → 전투
    now = host.nextWakeAt()!; host.tick(now);
    expect(host.state.phase).toBe('BATTLE');
    const eff = host.drainEffects();
    expect(eff.some((e) => e.type === 'segment')).toBe(true);
    const seg = host.getSegment(host.state.match!.segmentId!)!;
    expect(seg.frames.length).toBeGreaterThan(100);
    // 전 대회 자동 진행
    let guard = 0;
    while (host.state.phase !== 'PODIUM' && guard++ < 200) {
      const w = host.nextWakeAt(); if (w === null) break; now = Math.max(now, w); host.tick(now);
    }
    expect(host.state.phase).toBe('PODIUM');
    expect(host.state.history.length).toBe(3);
    const st = host.standings();
    console.log('최종 순위', st.map((s) => `${host.state.teams[s.teamId].name}:${s.rankPoints}pt/${s.totalScore}점`).join(', '));
    console.log('경기별', host.state.history.map((h) => h.arenaId + ' ' + h.standings.map((x) => `${host.state.teams[x.teamId].name}=${x.score}`).join(' ')).join(' | '));
    // 직렬화 복원
    const restored = new ClassHost(JSON.parse(JSON.stringify(host.state)));
    expect(restored.viewFor(s1.playerId, now).phase).toBe('PODIUM');
  });
});
