// server/src/platform/cleanup.ts
import type { ServerContext } from "./types.js";
import { allRooms, deleteRoom } from "./roomStore.js";
import { setEmptySinceIfNeeded } from "./roomService.js";

export function startCleanup(ctx: ServerContext) {
  const { now, config } = ctx;

  setInterval(() => {
    const t = now();
    const roomsArr = Array.from(allRooms().values());

    for (const room of roomsArr) {
      for (const p of room.players) {
        if (p.connected && t - p.lastSeen > config.PLAYER_INACTIVE_AFTER_MS) {
          p.connected = false;
        }
      }

      setEmptySinceIfNeeded(room, now);

      if (room.emptySince && t - room.emptySince > config.EMPTY_ROOM_TTL_MS) {
        deleteRoom(room.code);
      }
    }
  }, config.CLEANUP_TICK_MS);
}
