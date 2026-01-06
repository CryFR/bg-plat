// server/src/games/ghost-letters/socket.ts
import type { Socket } from "socket.io";
import type { ServerContext } from "../../platform/types.js";
import { getRoom } from "../../platform/roomStore.js";
import { isHostId } from "../../platform/roomService.js";
import { buildSnapshot } from "../../platform/snapshot.js";

import type { GhostLettersState, ReactionEmoji } from "./state.js";
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

function isSpectator(gs: GhostLettersState, playerId: string) {
  return roleOf(gs, playerId) == null;
}

function activeIds(gs: GhostLettersState) {
  return Object.keys(gs.roles);
}

function sendSecretTo(ctx: ServerContext, code: string, playerId: string) {
  const room = getRoom(code);
  if (!room?.game) return;
  if (room.game.id !== "ghost-letters") return;
  if (room.game.status !== "running" || room.game.state == null) return;

  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;

  ctx.io.to(p.socketId).emit("me:secret", buildSecretState(room.game.state, playerId));
}

function sendMailboxToGhost(ctx: ServerContext, code: string) {
  const room = getRoom(code);
  if (!room?.game) return;
  if (room.game.id !== "ghost-letters") return;
  if (room.game.status !== "running" || room.game.state == null) return;

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

      // "Players" are those who were in the lobby before start. Spectators do NOT need to ready.
      const lobbyPlayers = room.players.filter((p) => p.connected && !p.spectator);
      const allReady = lobbyPlayers.length >= 4 && lobbyPlayers.every((p) => p.ready);
      if (!allReady) return cb?.({ ok: false, error: "NOT_ALL_READY" });

      // Promote connected spectators into players for the new game.
      for (const p of room.players) {
        if (p.connected && p.spectator) {
          p.spectator = false;
          p.ready = false;
        }
      }

      const ids = room.players.filter((p) => p.connected && !p.spectator).map((p) => p.playerId);
      if (ids.length < 4) return cb?.({ ok: false, error: "NEED_4_PLAYERS" });

      try {
        room.game = { id: "ghost-letters", status: "running", state: initGhostLetters(ids) };
      } catch (e) {
        socket.emit("room:error", { message: String(e), at: "game:ghostletters:start" });
        return cb?.({ ok: false, error: String(e) });
      }

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

      // Restart promotes everyone to active players.
      for (const p of room.players) {
        if (p.connected) p.spectator = false;
        p.ready = false;
      }
      const ids = room.players.filter((p) => p.connected && !p.spectator).map((p) => p.playerId);

      if (ids.length < 4) return cb?.({ ok: false, error: "NEED_4_PLAYERS" });

      try {
        room.game = { id: "ghost-letters", status: "running", state: initGhostLetters(ids) };
      } catch (e) {
        socket.emit("room:error", { message: String(e), at: "game:ghostletters:restart" });
        return cb?.({ ok: false, error: String(e) });
      }

      for (const pid of ids) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "game:ghostletters:react",
    (
      {
        code,
        playerId,
        cardId,
        emoji,
      }: { code: string; playerId: string; cardId: string; emoji: ReactionEmoji | null },
      cb?: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });
      if (room.game.id !== "ghost-letters") return cb?.({ ok: false, error: "WRONG_GAME" });
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;

      if (isSpectator(gs, playerId)) return cb?.({ ok: true, ignored: true });

      // Spectators (joined mid-game) are read-only.
      if (isSpectator(gs, playerId)) {
        cb?.({ ok: true, ignored: true });
        return;
      }

      // Ghost can't react — silently ignore (no error UX).
      if (roleOf(gs, playerId) === "GHOST") {
        cb?.({ ok: true, ignored: true });
        return;
      }

      gs.reactions = gs.reactions ?? {};

      const byCard = (gs.reactions[cardId] = gs.reactions[cardId] ?? {});
      const prev = byCard[playerId];

      // Toggle behavior:
      // - emoji === null -> clear
      // - same emoji -> clear
      // - different emoji -> set
      if (emoji == null || prev === emoji) {
        delete byCard[playerId];
        if (Object.keys(byCard).length === 0) delete gs.reactions[cardId];
      } else {
        byCard[playerId] = emoji;
      }

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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;
      if (roleOf(gs, playerId) !== "KILLER") return cb?.({ ok: false, error: "ONLY_KILLER" });

      const res = pickCaseByKiller(gs, picked);
      if (!res.ok) return cb?.(res);

      ensureHandsToFive(gs, activeIds(gs));
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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;

      if (isSpectator(gs, playerId)) return cb?.({ ok: true, ignored: true });
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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;

      if (isSpectator(gs, playerId)) return cb?.({ ok: true, ignored: true });

      const ok = submitLetter(gs, playerId, cardId);
      if (!ok) return cb?.({ ok: false, error: "CANT_SEND" });

      sendSecretTo(ctx, code, playerId);

      const ids = activeIds(gs);
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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;
      if (roleOf(gs, playerId) !== "GHOST") return cb?.({ ok: false, error: "ONLY_GHOST" });

      ghostPick(gs, pickedIds ?? [], extraFromHandId ?? null);

      ensureHandsToFive(gs, activeIds(gs));
      for (const pid of room.players.map((p) => p.playerId)) sendSecretTo(ctx, code, pid);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on("game:ghostletters:next", ({ code, byPlayerId }: { code: string; byPlayerId: string }) => {
    const room = getRoom(code);
    if (!room?.game) return;
    if (room.game.id !== "ghost-letters") return;
    if (room.game.status !== "running" || room.game.state == null) return;
    if (!isHostId(room, byPlayerId)) return;

    const gs: GhostLettersState = room.game.state;
    const phaseBefore = gs.phase;
    if (phaseBefore !== "ROUND_DISCUSS") return;

    next(gs);

    const ids = room.players.map((p) => p.playerId);

    if (gs.phase === "ROUND_SEND") {
      ensureHandsToFive(gs, activeIds(gs));
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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;

      // Spectators (joined mid-game) are read-only.
      if (isSpectator(gs, playerId)) return cb?.({ ok: true, ignored: true });

      const r = castVote(gs, playerId, kind, choiceId);
      if (!r.ok) return cb?.(r);

      // Capture stage-final snapshot ONLY when the stage becomes complete.
      // We must snapshot BEFORE resolveVoteIfComplete(), because that may reset votes (e.g. accomplice arrest).
      const voters = activeIds(gs)
        .filter((pid) => gs.roles[pid] !== "GHOST" && !(gs.final?.arrestedIds ?? []).includes(pid));

      const isStageComplete = (k: "MOTIVE" | "PLACE" | "METHOD" | "KILLER") => {
        const map = gs.final!.votes[k];
        return voters.length > 0 && voters.every((pid) => !!map[pid]);
      };

      const phaseToKind: Record<string, "MOTIVE" | "PLACE" | "METHOD" | "KILLER"> = {
        FINAL_VOTE_MOTIVE: "MOTIVE",
        FINAL_VOTE_PLACE: "PLACE",
        FINAL_VOTE_METHOD: "METHOD",
        FINAL_VOTE_KILLER: "KILLER",
      };

      const before = gs.phase;
      const beforeKind = phaseToKind[before];
      if (beforeKind && isStageComplete(beforeKind)) {
        const snapVotes = { ...(gs.final!.votes[beforeKind] ?? {}) };
        if (Object.keys(snapVotes).length > 0) {
          gs.voteHistory = gs.voteHistory ?? [];

          const last = gs.voteHistory[gs.voteHistory.length - 1];
          // de-dup: if we already recorded this stage for this round, do nothing
          if (!(last && last.round === gs.round && last.phase === before)) {
            gs.voteHistory.push({
              round: gs.round,
              phase: before as any,
              kind: beforeKind,
              votes: snapVotes,
              at: Date.now(),
            });
            // safety cap
            if (gs.voteHistory.length > 200) gs.voteHistory.splice(0, gs.voteHistory.length - 200);
          }
        }
      }

      resolveVoteIfComplete(gs, activeIds(gs));
      const after = gs.phase;

      if (after === "FINAL_VOTE_KILLER") {
        setEligibleArrestPublic(gs, activeIds(gs));
      }

      if (before === "FINAL_VOTE_KILLER" && after === "FINAL_VOTE_KILLER") {
        setEligibleArrestPublic(gs, activeIds(gs));
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
      if (room.game.status !== "running" || room.game.state == null) return cb?.({ ok: false, error: "NOT_RUNNING" });

      const gs: GhostLettersState = room.game.state;

      const res = killerGuessSpecial(gs, playerId, targetPlayerId, roleGuess);
      if (!res.ok) return cb?.(res);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true, success: (res as any).success });
    }
  );
}