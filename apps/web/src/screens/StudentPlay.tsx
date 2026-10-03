import { useEffect, useMemo, useState } from 'react';
import { navigate, sessionStore } from '../App';
import { GameFlow } from './game/GameFlow';
import { GameClient } from '../state/store';
import { NetworkTransport } from '../net/transport';
import { Scene } from '../ui/common';

export function StudentPlay() {
  const session = useMemo(() => sessionStore.get(), []);
  const [client, setClient] = useState<GameClient | null>(null);
  // 클라이언트(WebSocket)는 effect 안에서 만들고 정리한다: StrictMode 이중 실행·뒤로가기에도 소켓이 남지 않는다
  useEffect(() => {
    if (!session) { navigate('/join'); return; }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const c = new GameClient(new NetworkTransport(`${proto}://${location.host}/ws/${session.code}?token=${encodeURIComponent(session.token)}`));
    setClient(c);
    return () => { c.destroy(); };
  }, [session]);
  if (!session) return <Scene bg="BG-02"><div className="center"><div className="panel">입장 정보가 없어요…</div></div></Scene>;
  if (!client) return <Scene bg="BG-02" dim><div className="center"><div className="panel">연결 준비 중…</div></div></Scene>;
  return <GameFlow client={client} mode="student" onExit={() => { sessionStore.set(null); navigate('/'); }} />;
}
