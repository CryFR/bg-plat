// server/src/platform/snapshot.ts
import type { ClientRoomSnapshot } from "./types.js";
import { getRoom } from "./roomStore.js";
import { getGameAdapter } from "../games/registry.js";

/**
 * Room snapshot without secrets.
 */
export function buildSnapshot(code: string): ClientRoomSnapshot {
  const room = getRoom(code);
  if (!room) return { code, players: [], game: null };

  const players = room.players.map((p) => ({
    playerId: p.playerId,
    socketId: p.socketId,
    name: p.name,
    isHost: p.isHost,
    ready: p.ready,
    connected: p.connected,
    spectator: !!p.spectator,
  }));

  if (!room.game) return { code, players, game: null };

  // If game only selected (not started) – don't call adapter views/state.
  if (room.game.status !== "running") {
    return { code, players, game: { id: room.game.id, status: room.game.status } };
  }

  const adapter = getGameAdapter(room.game.id);
  const publicState = adapter && room.game.state != null
    ? adapter.buildPublicState(room.game.state)
    : room.game.state;

  return {
    code,
    players,
    game: { id: room.game.id, status: room.game.status, state: publicState },
  };
}
