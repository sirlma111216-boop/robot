import { useEffect, useRef } from 'react';
import type { RobotView, SegmentResult } from '@scrap/core';
import { ArenaRenderer, type TeamInfo, type PlaybackHooks } from '../render/ArenaRenderer';
import { preload, SCENE_ASSETS } from '../assets/loader';

export interface ArenaViewProps {
  arenaId: string;
  teams: TeamInfo[];
  myTeamId: string | null;
  robots: RobotView[];
  capsules: { id: string; x: number; y: number; taken: boolean }[];
  crown?: { x: number; y: number } | null;
  preview?: { x: number; y: number }[] | null;
  playback?: { segmentId: string; segment: SegmentResult; startAt: number; serverNow: () => number; hooks?: PlaybackHooks } | null;
  reduceFx?: boolean;
}

export function ArenaView(p: ArenaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const hooksRef = useRef<PlaybackHooks | undefined>(p.playback?.hooks);
  hooksRef.current = p.playback?.hooks;

  useEffect(() => {
    if (!canvasRef.current) return;
    preload([p.arenaId, ...SCENE_ASSETS.arena]);
    const r = new ArenaRenderer(canvasRef.current, p.arenaId);
    rendererRef.current = r;
    return () => { r.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => { const r = rendererRef.current; if (r) { r.setArena(p.arenaId); preload([p.arenaId]); } }, [p.arenaId]);
  useEffect(() => { rendererRef.current?.setTeams(p.teams); }, [JSON.stringify(p.teams.map((t) => [t.id, t.styleIndex, t.build, t.name]))]);
  useEffect(() => { const r = rendererRef.current; if (r) { r.myTeamId = p.myTeamId; r.reduceFx = !!p.reduceFx; } }, [p.myTeamId, p.reduceFx]);
  useEffect(() => { if (!p.playback) rendererRef.current?.setStatic(p.robots, p.capsules, p.preview ?? null, p.crown ?? null); }, [p.robots, p.capsules, p.preview, p.crown?.x, p.crown?.y, !!p.playback]);
  useEffect(() => {
    const r = rendererRef.current; if (!r) return;
    if (p.playback) {
      const pb = p.playback;
      r.play(pb.segment, pb.startAt, pb.serverNow, { onSlot: (i) => hooksRef.current?.onSlot?.(i), onEnd: () => hooksRef.current?.onEnd?.(), onScore: (a, b, c) => hooksRef.current?.onScore?.(a, b, c) });
    } else r.stop();
  }, [p.playback?.segmentId]);

  return (
    <div className="arena-wrap">
      <canvas ref={canvasRef} role="img" aria-label="경기장" />
    </div>
  );
}
