import type { RobotBuild } from '../content/parts';
import type { Plan } from '../rules/commands';
import type { RobotSimState, CapsuleState, SegmentResult } from '../physics/sim';
import type { BotLevel } from '../bots/bot';

export type Phase = 'LOBBY' | 'BUILD' | 'INTRO' | 'PLAN' | 'BATTLE' | 'PITSTOP' | 'PODIUM';
export type Role = 'teacher' | 'student';

export interface Player {
  id: string;
  nick: string;
  role: Role;
  teamId: string | null;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
}

export interface Proposal { id: string; by: string; plan: Plan; votes: string[]; at: number }

export interface Team {
  id: string;
  name: string;
  styleIndex: number; // 0..5 → TEAM_STYLES
  leaderId: string | null;
  bot: { level: BotLevel; name: string } | null;
  members: string[];
  build: RobotBuild;
  buildReady: boolean;
  suggestions: { by: string; partId: string }[];
  proposals: Proposal[];
  lockedPlan: Plan | null;
  energy: number;
  matchScore: number;
  breakdown: { crown: number; push: number; capsule: number };
  rankPoints: number;
  matchResults: { arenaId: string; score: number; rank: number; points: number }[];
  emote: { emote: string; from: string; at: number } | null;
}

export interface Settings {
  matches: 1 | 3;
  buildSeconds: number;
  planSeconds: number;
  pitstopSeconds: number;
  introSeconds: number;
  resultSeconds: number;
  maxTeamSize: number;
  autoAdvance: boolean;
  allowSpectateTeams: boolean;
  botLevel: BotLevel;
}

export interface MatchState {
  index: number;
  arenaId: string;
  turn: number; // 1..TURNS_PER_MATCH, 0 = 아직 시작 전
  robots: RobotSimState[];
  capsules: CapsuleState[];
  capsuleSeq: number;
  segmentId: string | null;
  startAt: number | null; // 전투 재생 시작 서버 시각(ms)
  revealedPlans: Record<string, Plan>;
  turnScores: Record<string, number>;
  seed: number;
}

export interface MatchRecord { index: number; arenaId: string; standings: { teamId: string; score: number; rank: number; points: number }[] }

export interface ClassState {
  code: string;
  createdAt: number;
  locked: boolean;
  settings: Settings;
  players: Record<string, Player>;
  teams: Record<string, Team>;
  teamOrder: string[];
  phase: Phase;
  phaseVersion: number;
  deadline: number | null;
  match: MatchState | null;
  history: MatchRecord[];
  seed: number;
  versions: { rules: string; content: string; physics: string };
  teacherId: string | null;
  prevLeader: Record<string, string | null>;
  segments: Record<string, SegmentResult>; // 최근 구간(최대 N개 보관)
}

// ---------- 클라이언트 뷰 ----------
export interface TeamView {
  id: string; name: string; styleIndex: number; leaderId: string | null; leaderNick: string;
  members: { id: string; nick: string; connected: boolean }[];
  bot: { level: BotLevel; name: string } | null;
  build: RobotBuild; buildReady: boolean; energy: number;
  planLocked: boolean; proposalCount: number;
  matchScore: number; breakdown: Team['breakdown']; rankPoints: number; matchResults: Team['matchResults'];
  emote: Team['emote'];
  // 내 팀일 때만
  proposals?: Proposal[]; lockedPlan?: Plan | null; suggestions?: { by: string; partId: string }[];
}

export interface RobotView { teamId: string; x: number; y: number; angle: number; fallen: boolean; padIndex: number }

export interface MatchView {
  index: number; arenaId: string; turn: number; totalTurns: number;
  robots: RobotView[];
  capsules: { id: string; x: number; y: number; taken: boolean }[];
  segmentId: string | null; startAt: number | null;
  revealedPlans: Record<string, Plan>;
  turnScores: Record<string, number>;
}

export interface ClassView {
  code: string; phase: Phase; phaseVersion: number; deadline: number | null; serverNow: number; locked: boolean;
  settings: Settings;
  me: { playerId: string; nick: string; role: Role; teamId: string | null; isLeader: boolean } | null;
  players: { id: string; nick: string; role: Role; teamId: string | null; connected: boolean }[];
  teams: TeamView[];
  match: MatchView | null;
  history: MatchRecord[];
  standings: { teamId: string; rankPoints: number; totalScore: number; rank: number }[];
  chapterCount: number;
  teacherId: string | null;
  versions: ClassState['versions'];
}

export type HostEffect =
  | { type: 'segment'; segmentId: string }
  | { type: 'emote'; teamId: string; from: string; emote: string }
  | { type: 'kicked'; playerId: string }
  | { type: 'phase'; phase: Phase };
