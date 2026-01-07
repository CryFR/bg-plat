"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { gameRoomLoaders } from "./registry";

type Props = {
  gameId: string;
  code: string;
  // Optional injected room context (used by games that need lobby / players, etc.)
  snap?: any;
  socket?: any;
};

export function GameRoom({ gameId, code, snap, socket }: Props) {
  const Comp = useMemo(() => {
    const loader = gameRoomLoaders[gameId];
    if (!loader) return null;
    return dynamic(async () => {
      const mod = await loader();
      return mod.default;
    }, { ssr: false });
  }, [gameId]);

  if (!gameId) return <div style={{ padding: 24 }}>Нет gameId в комнате</div>;
  if (!Comp) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Неизвестная игра: {gameId}</h2>
        <div style={{ opacity: 0.8 }}>
          UI для этой игры не зарегистрирован. Добавь компонент комнаты в <code>lib/games/registry.ts</code>.
        </div>
      </div>
    );
  }

  return <Comp code={code} snap={snap} socket={socket} />;
}
