// server/src/index.ts
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import {
  createRoom,
  getRoom,
  findRoomBySocketId,
  deleteRoom,
  allRooms,
  socketIndex,
  ensureHost,
  removePlayer,
} from "./rooms.js";

import type { ClientRoomSnapshot, Room, Player, GhostLettersState, Role } from "./types.js";

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
} from "./games/ghostLetters.js";

const PORT = 3001;

const lastCreateBySocket = new Map<string, number>();
// room TTL when nobody connected (ms)
const EMPTY_ROOM_TTL = 10 * 60 * 1000; // 10 min
// mark connected=false if no pings/traffic for too long (ms)
const PLAYER_INACTIVE_AFTER = 2 * 60 * 1000; // 2 min
// cleanup tick
const CLEANUP_TICK = 30 * 1000;

const app = express();
app.use(cors({ origin: true, credentials: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

function now() {
  return Date.now();
}

function touchRoom(room: Room) {
  room.lastActiveAt = now();
  room.emptySince = null;
}

function markSeen(room: Room, playerId: string) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;
  p.lastSeen = now();
  p.connected = true;
  room.lastActiveAt = now();
}

function markDisconnected(room: Room, playerId: string) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;
  p.connected = false;
  p.lastSeen = now();
}

function isHostId(room: Room, playerId: string) {
  return !!room.players.find((p) => p.playerId === playerId)?.isHost;
}

function roleOf(gs: GhostLettersState, playerId: string): Role | null {
  return gs.roles[playerId] ?? null;
}

function canSeeCase(role: Role | null) {
  return role === "GHOST" || role === "KILLER" || role === "ACCOMPLICE";
}

/**
 * Snapshot without secrets (hands/mailbox/deck/caseFile)
 */
function snapshot(code: string): ClientRoomSnapshot {
  const room = getRoom(code);
  if (!room) return { code, players: [], game: null };

  const players = room.players.map((p) => ({
    playerId: p.playerId,
    socketId: p.socketId,
    name: p.name,
    isHost: p.isHost,
    ready: p.ready,
    connected: p.connected,
  }));

  if (!room.game) return { code, players, game: null };

  const gs = room.game.state;

  const state: any = {
    phase: gs.phase,
    round: gs.round,

    setup: {
      board: gs.setup.board,
      currentTurnPlayerId: gs.setup.currentTurnPlayerId,
      turnOrder: gs.setup.turnOrder,
    },

    table: gs.table,
    revealedHints: gs.revealedHints,

    public: gs.public ?? {},

    final: gs.final
      ? {
        selected: gs.final.selected,
        arrestedIds: gs.final.arrestedIds,
        result: gs.final.result ?? null,
      }
      : null,

    result: (gs as any).result ?? null,
  };

  return { code, players, game: { id: "ghost-letters", state } };
}

/**
 * Send private info to ONE player
 */
function sendSecretTo(room: Room, playerId: string) {
  if (!room.game) return;
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;

  const gs = room.game.state;
  const role = roleOf(gs, playerId);

  const secret: any = { role, hand: gs.hands[playerId] ?? [] };

  if (gs.phase === "SETUP_DRAFT") {
    secret.draftCard = gs.setup.draftCardByPlayerId[playerId] ?? null;
  }

  if (role && canSeeCase(role)) {
    secret.caseFile = gs.caseFile;
  }

  io.to(p.socketId).emit("me:secret", secret);
}

/**
 * Send mailbox to ghost
 */
function sendMailboxToGhost(room: Room) {
  if (!room.game) return;
  const gs = room.game.state;

  const ghostId = Object.keys(gs.roles).find((pid) => gs.roles[pid] === "GHOST");
  if (!ghostId) return;

  const ghost = room.players.find((p) => p.playerId === ghostId);
  if (!ghost) return;

  const cards = Object.values(gs.mailbox ?? {});
  io.to(ghost.socketId).emit("ghost:mailbox", { cards });
}

/**
 * Publish eligible arrest candidates without leaking ghost identity (clients just see list)
 */
function setEligibleArrestPublic(gs: GhostLettersState, allPlayerIds: string[]) {
  if (!gs.final) return;

  const eligible = allPlayerIds.filter(
    (pid) => gs.roles[pid] !== "GHOST" && !gs.final!.arrestedIds.includes(pid)
  );

  gs.public = gs.public ?? {};
  gs.public.eligibleArrestPlayerIds = eligible;
}

io.on("connection", (socket) => {
  /**
   * Join existing room by link (code) with nickname and stable playerId (for reconnect).
   */
  socket.on(
    "room:join",
    ({ code, name, playerId }: { code: string; name: string; playerId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });

      let p = room.players.find((x) => x.playerId === playerId);

      if (p) {
        // reconnect
        p.socketId = socket.id;
        p.name = name?.trim() || p.name;
        p.connected = true;
        p.lastSeen = now();
      } else {
        // new player
        const np: Player = {
          playerId,
          socketId: socket.id,
          name: name?.trim() || "Player",
          isHost: room.players.length === 0,
          ready: false,
          connected: true,
          lastSeen: now(),
        };
        room.players.push(np);
      }

      ensureHost(room);
      touchRoom(room);

      socket.join(code);

      // IMPORTANT: track socket -> room/player for disconnect cleanup
      socketIndex.set(socket.id, { code, playerId });

      io.to(code).emit("room:update", snapshot(code));
      if (room.game) sendSecretTo(room, playerId);

      cb?.({ ok: true, snapshot: snapshot(code) });
    }
  );

  /**
   * Create new room (host becomes creator). Returns code.
   */
  socket.on(
    "room:create",
    ({ name, playerId }: { name: string; playerId: string }, cb: (res: any) => void) => {

      console.log("[room:create]", {
        socketId: socket.id,
        ip: socket.handshake.address,
        ua: socket.handshake.headers["user-agent"],
        t: Date.now(),
        playerId,
        name,
      });

      // 🔒 rate-limit (ОЧЕНЬ важно)
      const prev = lastCreateBySocket.get(socket.id) ?? 0;
      if (Date.now() - prev < 1500) {
        return cb?.({ ok: false, error: "CREATE_RATE_LIMIT" });
      }
      lastCreateBySocket.set(socket.id, Date.now());

      const room = createRoom();

      const host: Player = {
        playerId,
        socketId: socket.id,
        name: name?.trim() || "Host",
        isHost: true,
        ready: false,
        connected: true,
        lastSeen: now(),
      };

      room.players.push(host);
      touchRoom(room);

      socket.join(room.code);
      socketIndex.set(socket.id, { code: room.code, playerId });

      cb?.({ ok: true, code: room.code, snapshot: snapshot(room.code) });
      io.to(room.code).emit("room:update", snapshot(room.code));
    }
  );


  socket.on(
    "room:ready",
    ({ code, playerId, ready }: { code: string; playerId: string; ready: boolean }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });

      const p = room.players.find((x) => x.playerId === playerId);
      if (!p) return cb?.({ ok: false, error: "PLAYER_NOT_FOUND" });

      p.ready = !!ready;
      markSeen(room, playerId);

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Host can kick player
   */
  socket.on(
    "room:kick",
    (
      { code, byPlayerId, targetPlayerId }: { code: string; byPlayerId: string; targetPlayerId: string },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      if (!isHostId(room, byPlayerId)) return cb?.({ ok: false, error: "NOT_HOST" });

      const target = room.players.find((p) => p.playerId === targetPlayerId);
      if (!target) return cb?.({ ok: false, error: "PLAYER_NOT_FOUND" });

      io.to(target.socketId).emit("room:kicked", {});
      removePlayer(room, targetPlayerId);

      if (!room.players.some((p) => p.connected)) {
        room.emptySince = room.emptySince ?? now();
      }

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Start game (host only). Requires everyone ready and >=4 players.
   */
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

      // send roles + initial draft card
      for (const pid of ids) sendSecretTo(room, pid);

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Restart game (host only). Resets ready flags.
   */
  socket.on(
    "game:ghostletters:restart",
    ({ code, byPlayerId }: { code: string; byPlayerId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      if (!isHostId(room, byPlayerId)) return cb?.({ ok: false, error: "NOT_HOST" });

      const ids = room.players.map((p) => p.playerId);

      room.players.forEach((p) => (p.ready = false));
      room.game = { id: "ghost-letters", state: initGhostLetters(ids) };

      for (const pid of ids) sendSecretTo(room, pid);

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Setup: place draft card into category (turn-based)
   */
  socket.on(
    "game:ghostletters:setupPlace",
    (
      { code, playerId, category }: { code: string; playerId: string; category: "MOTIVE" | "PLACE" | "METHOD" },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;

      const res = placeDraftCard(gs, playerId, category);
      if (!res.ok) return cb?.(res);

      // update secrets for everyone (draft card may change)
      for (const pid of room.players.map((p) => p.playerId)) {
        sendSecretTo(room, pid);
      }

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Killer picks true case.
   * After that: deal 5 to everyone (including ghost) and move to ghost first clue phase.
   */
  socket.on(
    "game:ghostletters:killerPickCase",
    (
      { code, playerId, picked }: { code: string; playerId: string; picked: { motiveId: string; placeId: string; methodId: string } },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;
      if (roleOf(gs, playerId) !== "KILLER") return cb?.({ ok: false, error: "ONLY_KILLER" });

      const res = pickCaseByKiller(gs, picked);
      if (!res.ok) return cb?.(res);

      // deal 5 to all (including ghost)
      ensureHandsToFive(gs, room.players.map((p) => p.playerId));

      // send secrets to all (hands + roles; caseFile only for eligible)
      for (const pid of room.players.map((p) => p.playerId)) {
        sendSecretTo(room, pid);
      }

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Discard 1 card (closed), max 1 per round per player. Then draw to 5.
   */
  socket.on(
    "game:ghostletters:discard",
    ({ code, playerId, cardId }: { code: string; playerId: string; cardId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;
      const res = discardOne(gs, playerId, cardId);
      if (!res.ok) return cb?.(res);

      sendSecretTo(room, playerId);

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Send 1 letter to ghost mailbox (max 1 per round).
   */
  socket.on(
    "game:ghostletters:send",
    ({ code, playerId, cardId }: { code: string; playerId: string; cardId: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;

      const ok = submitLetter(gs, playerId, cardId);
      if (!ok) return cb?.({ ok: false, error: "CANT_SEND" });

      sendSecretTo(room, playerId);

      const ids = room.players.map((p) => p.playerId);
      if (allLettersSent(gs, ids)) {
        gs.phase = "ROUND_GHOST_PICK";
        sendMailboxToGhost(room);
      }

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Ghost chooses hints from mailbox (can be empty), and can add +1 from own hand.
   */
  socket.on(
    "game:ghostletters:ghostPick",
    (
      { code, playerId, pickedIds, extraFromHandId }: { code: string; playerId: string; pickedIds: string[]; extraFromHandId?: string | null },
      cb: (res: any) => void
    ) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;

      if (roleOf(gs, playerId) !== "GHOST") return cb?.({ ok: false, error: "ONLY_GHOST" });

      ghostPick(gs, pickedIds ?? [], extraFromHandId ?? null);

      // ghost might spend card from hand; also allow drawing to 5 for everyone
      ensureHandsToFive(gs, room.players.map((p) => p.playerId));

      // update all secrets (hands might have changed by draws)
      for (const pid of room.players.map((p) => p.playerId)) {
        sendSecretTo(room, pid);
      }

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Host moves game forward from discuss
   */
  socket.on("game:ghostletters:next", ({ code, byPlayerId }: { code: string; byPlayerId: string }) => {
    const room = getRoom(code);
    if (!room?.game) return;
    if (!isHostId(room, byPlayerId)) return;

    const gs = room.game.state;
    const phaseBefore = gs.phase;

    // хост может жать "следующий шаг" только из обсуждения
    if (phaseBefore !== "ROUND_DISCUSS") return;

    next(gs);

    const ids = room.players.map((p) => p.playerId);

    if (gs.phase === "ROUND_SEND") {
      ensureHandsToFive(gs, ids);
      for (const pid of ids) sendSecretTo(room, pid);
    }

    if (gs.phase === "FINAL_VOTE") {
      startFinalVoting(gs);
      gs.public = gs.public ?? {};
      gs.public.eligibleArrestPlayerIds = [];
    }

    io.to(code).emit("room:update", snapshot(code));
  });


  /**
   * Voting in final stages
   */
  socket.on(
    "game:ghostletters:vote",
    ({ code, playerId, kind, choiceId }: { code: string; playerId: string; kind: "MOTIVE" | "PLACE" | "METHOD" | "KILLER"; choiceId: string },
      cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;

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

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true });
    }
  );

  /**
   * Killer guess special role (witness/expert)
   */
  socket.on(
    "game:ghostletters:killerGuessSpecial",
    ({ code, playerId, targetPlayerId, roleGuess }: { code: string; playerId: string; targetPlayerId: string; roleGuess: "WITNESS" | "EXPERT" }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room?.game) return cb?.({ ok: false, error: "NO_GAME" });

      const gs = room.game.state;

      const res = killerGuessSpecial(gs, playerId, targetPlayerId, roleGuess);
      if (!res.ok) return cb?.(res);

      io.to(code).emit("room:update", snapshot(code));
      cb?.({ ok: true, success: (res as any).success });
    }
  );

  /**
   * Disconnect: keep player in room for reconnect, just mark connected=false.
   */
  socket.on("disconnect", () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;

    const { room, playerId } = found;

    markDisconnected(room, playerId);

    const anyConnected = room.players.some((p) => p.connected);
    if (!anyConnected) {
      room.emptySince = room.emptySince ?? now();
    }

    io.to(room.code).emit("room:update", snapshot(room.code));

    socketIndex.delete(socket.id);
  });
});

/**
 * Cleanup: delete rooms if nobody connected for TTL.
 * Also flip connected=false if inactive too long.
 */
setInterval(() => {
  const t = now();
  const roomsArr = Array.from(allRooms().values());

  for (const room of roomsArr) {
    for (const p of room.players) {
      if (p.connected && t - p.lastSeen > PLAYER_INACTIVE_AFTER) {
        p.connected = false;
      }
    }

    const anyConnected = room.players.some((p) => p.connected);
    if (!anyConnected) {
      room.emptySince = room.emptySince ?? t;
    } else {
      room.emptySince = null;
    }

    if (room.emptySince && t - room.emptySince > EMPTY_ROOM_TTL) {
      deleteRoom(room.code);
    }
  }
}, CLEANUP_TICK);

server.listen(PORT, () => console.log(`WS server on http://localhost:${PORT}`));
