// server/src/games/dogtown/socket.ts
import type { Socket } from "socket.io";
import type { ServerContext } from "../../platform/types.js";

import { getRoom } from "../../platform/roomStore.js";
import { buildSnapshot } from "../../platform/snapshot.js";

import type { DogtownState } from "./state.js";
import {
  submitDeedsKeep,
  endTrade,
  buildPlace,
  buildDone,
  tradeCreateOffer,
  tradeCancelOffer,
  tradeAcceptOffer,
  tradeRequest,
  tradeRespond,
  tradeUpdateSession,
  tradeCommitSession,
  tradeCancelSession,
} from "./rules.js";
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

  // ---- Trade scaffolding (offers) ----

  socket.on(
    "dogtown:tradeOffer",
    (
      {
        code,
        playerId,
        to,
        giveMoney,
        takeMoney,
        giveTokenIds,
        takeTokenIds,
      }: {
        code: string;
        playerId: string;
        to?: string | null;
        giveMoney?: number;
        takeMoney?: number;
        giveTokenIds?: string[];
        takeTokenIds?: string[];
      },
      cb?: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeCreateOffer(room.game.state as DogtownState, playerId, {
        to: to ?? null,
        giveMoney,
        takeMoney,
        giveTokenIds,
        takeTokenIds,
      });

      if (!(res as any).ok) return cb?.(res);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:tradeCancel",
    ({ code, playerId, offerId }: { code: string; playerId: string; offerId: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeCancelOffer(room.game.state as DogtownState, playerId, String(offerId));
      if (!(res as any).ok) return cb?.(res);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:tradeAccept",
    ({ code, playerId, offerId }: { code: string; playerId: string; offerId: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeAcceptOffer(room.game.state as DogtownState, playerId, String(offerId));
      if (!(res as any).ok) return cb?.(res);

      // money changes are secret => re-send secrets
      for (const p of room.players) sendSecretTo(ctx, code, p.playerId);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  // ---- Trade sessions (request -> shared trade panel) ----

  socket.on(
    "dogtown:tradeRequest",
    ({ code, playerId, to }: { code: string; playerId: string; to: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeRequest(room.game.state as DogtownState, playerId, String(to));
      if (!(res as any).ok) return cb?.(res);
      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:tradeRespond",
    ({ code, playerId, sessionId, accept }: { code: string; playerId: string; sessionId: string; accept: boolean }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeRespond(room.game.state as DogtownState, playerId, String(sessionId), !!accept);
      if (!(res as any).ok) return cb?.(res);
      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:tradeUpdate",
    (
      { code, playerId, sessionId, money, tokenIds }: { code: string; playerId: string; sessionId: string; money?: number; tokenIds?: string[] },
      cb?: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeUpdateSession(room.game.state as DogtownState, playerId, String(sessionId), { money, tokenIds });
      if (!(res as any).ok) return cb?.(res);
      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:tradeCommit",
    ({ code, playerId, sessionId, committed }: { code: string; playerId: string; sessionId: string; committed: boolean }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeCommitSession(room.game.state as DogtownState, playerId, String(sessionId), !!committed);
      if (!(res as any).ok) return cb?.(res);

      // execution may change money => refresh secrets
      if ((res as any).executed) {
        for (const p of room.players) sendSecretTo(ctx, code, p.playerId);
      }

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:tradeCancelSession",
    ({ code, playerId, sessionId }: { code: string; playerId: string; sessionId: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = tradeCancelSession(room.game.state as DogtownState, playerId, String(sessionId));
      if (!(res as any).ok) return cb?.(res);
      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
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

      const res = buildPlace(room.game.state as DogtownState, playerId, Number(cell), String(tokenId));
      if (!(res as any).ok) return cb?.(res);

      for (const p of room.players) sendSecretTo(ctx, code, p.playerId);
      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );

  socket.on(
    "dogtown:buildDone",
    ({ code, playerId }: { code: string; playerId: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "dogtown") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const res = buildDone(room.game.state as DogtownState, playerId);
      if (!(res as any).ok) return cb?.(res);

      for (const p of room.players) sendSecretTo(ctx, code, p.playerId);
      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.(res);
    }
  );
}
