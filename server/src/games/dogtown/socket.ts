// server/src/games/dogtown/socket.ts
import type { Socket } from "socket.io";
import type { ServerContext } from "../../platform/types.js";

import { getRoom } from "../../platform/roomStore.js";
import { buildSnapshot } from "../../platform/snapshot.js";

import type { DogtownState } from "./state.js";
import { submitDeedsKeep, endTrade, buildPlace, buildDone } from "./rules.js";
import { buildDogtownSecretState } from "./views.js";

function sendSecretTo(ctx: ServerContext, code: string, playerId: string) {
  const room = getRoom(code);
  if (!room?.game) return;
  if (room.game.id !== "dogtown") return;
  if (room.game.status !== "running" || room.game.state == null) return;

  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;

  ctx.io.to(p.socketId).emit("me:secret", buildDogtownSecretState(room.game.state as DogtownState, playerId));
}

export function registerDogtownSocketHandlers(ctx: ServerContext, socket: Socket) {
  const { io } = ctx;

  socket.on(
    "dogtown:deedsKeep",
    (
      { code, playerId, keep }: { code: string; playerId: string; keep: number[] },
      cb?: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      submitDeedsKeep(room.game.state as DogtownState, playerId, keep);

      // update secrets (money/hands) for everyone
      for (const p of room.players) sendSecretTo(ctx, code, p.playerId);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "dogtown:endTrade",
    ({ code }: { code: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      endTrade(room.game.state as DogtownState);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "dogtown:buildPlace",
    (
      { code, playerId, cell, tokenId }: { code: string; playerId: string; cell: number; tokenId: string },
      cb?: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      buildPlace(room.game.state as DogtownState, playerId, Number(cell), String(tokenId));
      for (const p of room.players) sendSecretTo(ctx, code, p.playerId);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "dogtown:buildDone",
    ({ code, playerId }: { code: string; playerId: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      buildDone(room.game.state as DogtownState, playerId);
      for (const p of room.players) sendSecretTo(ctx, code, p.playerId);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );
}
