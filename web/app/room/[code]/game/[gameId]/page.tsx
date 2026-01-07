"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { GameRoom } from "../../../../../lib/games/GameRoom";
import { useRoom } from "../../../../../lib/platform/useRoom";

export default function GamePage() {
  const router = useRouter();
  const { code, gameId } = useParams() as any;

  // join + keep room alive even if game page is direct entry
  const { kicked, snap, socket } = useRoom(String(code));

  useEffect(() => {
    const st = (snap as any)?.game?.status as string | undefined;
    const actualId = (snap as any)?.game?.id as string | undefined;

    if (!snap) return;

    // Dogtown has its own pre-game lobby on the game page.
    // Other games are accessible only when running.
    const isDogtown = actualId === "dogtown";
    const okStatus = st === "running" || (isDogtown && st === "selected");
    if (!actualId || !okStatus) {
      router.replace(`/room/${code}`);
      return;
    }

    // If wrong game URL, normalize
    if (actualId && String(gameId) !== actualId) {
      router.replace(`/room/${code}/game/${actualId}`);
    }
  }, [snap, router, code, gameId]);

  if (kicked) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Доступ закрыт</h2>
        <div style={{ opacity: 0.8 }}>{kicked}</div>
      </div>
    );
  }

  return <GameRoom gameId={String(gameId)} code={String(code)} snap={snap as any} socket={socket as any} />;
}
