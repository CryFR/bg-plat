// server/src/games/ghost-letters/socket.ts
import type { Socket } from "socket.io";
import type { ServerContext } from "../../platform/types.js";
import { getRoom } from "../../platform/roomStore.js";
import { isHostId } from "../../platform/roomService.js";
import { buildSnapshot } from "../../platform/snapshot.js";

import type { GhostLettersState } from "./state.js";
import {
  initGhostLetters,
  placeDraftCard,
  pickCaseByKiller,
  ensureHandsToFive,
  submitLetter,
  allLettersSent,
  ghostPick,
  next,
  startFinalVoting,
  castVote,
  resolveVoteIfComplete,
  killerGuessSpecial,
  discardOne,
} from "./rules.js";

import { buildMailboxPayload, buildSecretState, setEligibleArrestPublic } from "./views.js";

function roleOf(gs: GhostLettersState, playerId: string) {
  return gs.roles[playerId] ?? null;
}

function sendSecretTo(ctx: ServerContext, code: string, playerId: string) {
  const room = getRoom(code);
  if (!room?.game) return;
  if (room.game.id !== "ghost-letters") return;

  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;

  ctx.io.to(p.socketId).emit("me:secret", buildSecretState(room.game.state, playerId));
}

function sendMailboxToGhost(ctx: ServerContext, code: string) {
  const room = getRoom(code);
  if (!room?.game) return;
  if (room.game.id !== "ghost-letters") return;

  const gs: GhostLettersState = room.game.state;
  const ghostId = Object.keys(gs.roles).find((pid) => gs.roles[pid] === "GHOST");
  if (!ghostId) return;

  const ghost = room.players.find((p) => p.playerId === ghostId);
  if (!ghost) return;

  ctx.io.to(ghost.socketId).emit("ghost:mailbox", buildMailboxPayload(gs));
}

export function registerGhostLettersHandlers(ctx: ServerContext, socket: Socket) {
  const { io } = ctx;

  socket.on(
    "game:ghostletters:start",
    ({ code, byPlayerId }: { code: string; byPlayerId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      if (!isHostId(room, byPlayerId)) return cb?.({ ok: false, error: "NOT_HOST" });

      const allReady = room.players.length >= 4 && room.players.every((p) => p.ready);
      if (!allReady) return cb?.({ ok: false, error: "NOT_ALL_READY" });

      const ids = room.players.map((p) => p.playerId);
      room.game = { id: "ghost-letters", state: initGhostLetters(ids) };

      for (const pid of ids) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:restart",
    ({ code, byPlayerId }: { code: string; byPlayerId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      if (!isHostId(room, byPlayerId)) return cb?.({ ok: false, error: "NOT_HOST" });

      const ids = room.players.map((p) => p.playerId);

      room.players.forEach((p) => (p.ready = false));
      room.game = { id: "ghost-letters", state: initGhostLetters(ids) };

      for (const pid of ids) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:setupPlace",
    (
      { code, playerId, category }: { code: string; playerId: string; category: "MOTIVE" | "PLACE" | "METHOD" },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;

      const res = placeDraftCard(gs, playerId, category);
      if (!res.ok) return cb?.(res);

      for (const pid of room.players.map((p) => p.playerId)) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:killerPickCase",
    (
      {
        code,
        playerId,
        picked,
      }: {
        code: string;
        playerId: string;
        picked: { motiveId: string; placeId: string; methodId: string };
      },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;
      if (roleOf(gs, playerId) !== "KILLER") return cb?.({ ok: false, error: "ONLY_KILLER" });

      const res = pickCaseByKiller(gs, picked);
      if (!res.ok) return cb?.(res);

      ensureHandsToFive(gs, room.players.map((p) => p.playerId));
      for (const pid of room.players.map((p) => p.playerId)) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:discard",
    ({ code, playerId, cardId }: { code: string; playerId: string; cardId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;
      const res = discardOne(gs, playerId, cardId);
      if (!res.ok) return cb?.(res);

      sendSecretTo(ctx, code, playerId);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:send",
    ({ code, playerId, cardId }: { code: string; playerId: string; cardId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;

      const ok = submitLetter(gs, playerId, cardId);
      if (!ok) return cb?.({ ok: false, error: "CANT_SEND" });

      sendSecretTo(ctx, code, playerId);

      const ids = room.players.map((p) => p.playerId);
      if (allLettersSent(gs, ids)) {
        gs.phase = "ROUND_GHOST_PICK";
        sendMailboxToGhost(ctx, code);
      }

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:ghostPick",
    (
      {
        code,
        playerId,
        pickedIds,
        extraFromHandId,
      }: {
        code: string;
        playerId: string;
        pickedIds: string[];
        extraFromHandId?: string | null;
      },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;
      if (roleOf(gs, playerId) !== "GHOST") return cb?.({ ok: false, error: "ONLY_GHOST" });

      ghostPick(gs, pickedIds ?? [], extraFromHandId ?? null);

      ensureHandsToFive(gs, room.players.map((p) => p.playerId));
      for (const pid of room.players.map((p) => p.playerId)) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on("game:ghostletters:next", ({ code, byPlayerId }: { code: string; byPlayerId: string }) => {
    const room = getRoom(code);
    if (!room?.game) return;
    if (room.game.id !== "ghost-letters") return;
    if (!isHostId(room, byPlayerId)) return;

    const gs: GhostLettersState = room.game.state;
    const phaseBefore = gs.phase;
    if (phaseBefore !== "ROUND_DISCUSS") return;

    next(gs);

    const ids = room.players.map((p) => p.playerId);

    if (gs.phase === "ROUND_SEND") {
      ensureHandsToFive(gs, ids);
      for (const pid of ids) sendSecretTo(ctx, code, pid);
    }

    if (gs.phase === "FINAL_VOTE") {
      startFinalVoting(gs);
      gs.public = gs.public ?? {};
      gs.public.eligibleArrestPlayerIds = [];
    }

    io.to(code).emit("room:update", buildSnapshot(code));
  });

  socket.on(
    "game:ghostletters:vote",
    (
      {
        code,
        playerId,
        kind,
        choiceId,
      }: {
        code: string;
        playerId: string;
        kind: "MOTIVE" | "PLACE" | "METHOD" | "KILLER";
        choiceId: string;
      },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;

      const r = castVote(gs, playerId, kind, choiceId);
      if (!r.ok) return cb?.(r);

      const before = gs.phase;
      resolveVoteIfComplete(gs, room.players.map((p) => p.playerId));
      const after = gs.phase;

      if (after === "FINAL_VOTE_KILLER") {
        setEligibleArrestPublic(gs, room.players.map((p) => p.playerId));
      }

      if (before === "FINAL_VOTE_KILLER" && after === "FINAL_VOTE_KILLER") {
        setEligibleArrestPublic(gs, room.players.map((p) => p.playerId));
      }

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:killerGuessSpecial",
    (
      {
        code,
        playerId,
        targetPlayerId,
        roleGuess,
      }: { code: string; playerId: string; targetPlayerId: string; roleGuess: "WITNESS" | "EXPERT" },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });

      const gs: GhostLettersState = room.game.state;

      const res = killerGuessSpecial(gs, playerId, targetPlayerId, roleGuess);
      if (!res.ok) return cb?.(res);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true, success: (res as any).success });
    }
  );
}
