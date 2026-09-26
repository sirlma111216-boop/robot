import React, { useEffect, useMemo, useState } from 'react';
import { navigate, sessionStore } from '../App';
import { GameFlow } from './game/GameFlow';
import { GameClient } from '../state/store';
import { NetworkTransport } from '../net/transport';
import { Scene } from '../ui/common';

export function StudentPlay() {
  const session = useMemo(() => sessionStore.get(), []);
  const [client] = useState<GameClient | null>(() => {
    if (!session) return null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return new GameClient(new NetworkTransport(`${proto}://${location.host}/ws/${session.code}?token=${encodeURIComponent(session.token)}`));
  });
  useEffect(() => { if (!session) navigate('/join'); return () => { client?.destroy(); }; }, []);
  if (!session || !client) return <Scene bg="BG-02"><div className="center"><div className="panel">입장 정보가 없어요…</div></div></Scene>;
  return <GameFlow client={client} mode="student" onExit={() => { client.destroy(); sessionStore.set(null); navigate('/'); }} />;
}
