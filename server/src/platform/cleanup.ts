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
      // IMPORTANT:
      // Do NOT mark players as disconnected based on lastSeen.
      // `connected` must reflect the real socket connection state and is
      // updated by socket connect/disconnect handlers.
      // lastSeen can still be used for UI "activity" or room GC, but should
      // not affect participation eligibility.

      setEmptySinceIfNeeded(room, now);

      if (room.emptySince && t - room.emptySince > config.EMPTY_ROOM_TTL_MS) {
        deleteRoom(room.code);
      }
    }
  }, config.CLEANUP_TICK_MS);
}
