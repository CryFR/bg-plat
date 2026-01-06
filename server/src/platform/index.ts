// server/src/platform/index.ts
import type { Socket } from "socket.io";
import type { ServerContext, Player } from "./types.js";

import {
  createRoom,
  getRoom,
  findRoomBySocketId,
  bindSocketToRoom,
  unbindSocket,
} from "./roomStore.js";

import {
  ensureHost,
  isHostId,
  markDisconnected,
  markSeen,
  removePlayer,
  touchRoom,
  setEmptySinceIfNeeded,
} from "./roomService.js";

import { buildSnapshot } from "./snapshot.js";
import { allGameAdapters, getGameAdapter } from "../games/registry.js";

// socket.id -> last create timestamp
const lastCreateBySocket = new Map<string, number>();

function sendSecretTo(ctx: ServerContext, roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  if (!room?.game) return;
  if (room.game.status !== "running") return;
  if (room.game.state == null) return;

  const adapter = getGameAdapter(room.game.id);
  if (!adapter) return;

  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;

  ctx.io.to(p.socketId).emit("me:secret", adapter.buildSecretState(room.game.state, playerId));
}

export function registerPlatform(ctx: ServerContext) {
  const { now } = ctx;

  ctx.io.on("connection", (socket) => {
    // Any inbound event from this socket counts as activity.
    // Without this, players can become "offline" mid-game if they don't interact for a while.
    socket.onAny(() => {
      const found = findRoomBySocketId(socket.id);
      if (!found) return;
      markSeen(found.room, found.playerId, now);
    });

    registerRoomHandlers(ctx, socket);

    // register all games on this socket
    for (const adapter of allGameAdapters()) {
      adapter.registerSocketHandlers(ctx, socket);
    }
  });
}

function registerRoomHandlers(ctx: ServerContext, socket: Socket) {
  const { io, now, config } = ctx;

  // Lightweight heartbeat from client to prevent "inactive" disconnects during long phases.
  socket.on(
    "room:seen",
    ({ code, playerId }: { code: string; playerId: string }, cb?: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      const p = room.players.find((x) => x.playerId === playerId);
      if (!p) return cb?.({ ok: false, error: "PLAYER_NOT_FOUND" });
      // Only allow updating your own activity.
      if (p.socketId !== socket.id) return cb?.({ ok: false, error: "BAD_SOCKET" });
      markSeen(room, playerId, now);
      cb?.({ ok: true });
    }
  );

  socket.on(
    "room:join",
    (
      { code, name, playerId }: { code: string; name: string; playerId: string },
      cb: (res: any) => void
    ) => {
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
        const np: Player = {
          playerId,
          socketId: socket.id,
          name: name?.trim() || "Player",
          isHost: room.players.length === 0,
          ready: false,
          connected: true,
          lastSeen: now(),
          spectator: room.game?.status === "running", // join mid-game => spectator
        };
        room.players.push(np);
      }

      ensureHost(room);
      touchRoom(room, now);

      socket.join(code);
      bindSocketToRoom(socket.id, code, playerId);

      io.to(code).emit("room:update", buildSnapshot(code));
      sendSecretTo(ctx, code, playerId);

      cb?.({ ok: true, snapshot: buildSnapshot(code) });
    }
  );

  socket.on(
    "room:create",
    (
      { name, playerId, gameId }: { name: string; playerId: string; gameId?: string },
      cb: (res: any) => void
    ) => {
      const prev = lastCreateBySocket.get(socket.id) ?? 0;
      if (now() - prev < config.CREATE_RATE_LIMIT_MS) {
        return cb?.({ ok: false, error: "CREATE_RATE_LIMIT" });
      }
      lastCreateBySocket.set(socket.id, now());

      const room = createRoom(now);

      const host: Player = {
        playerId,
        socketId: socket.id,
        name: name?.trim() || "Host",
        isHost: true,
        ready: false,
        connected: true,
        lastSeen: now(),
        spectator: false,
      };

      room.players.push(host);

      // Optional: pre-select a game at room creation (does NOT start the game).
if (gameId) {
  const adapter = getGameAdapter(gameId);
  if (adapter) {
    room.game = { id: gameId, status: "selected", state: null };
  }
}

touchRoom(room, now);

      socket.join(room.code);
      bindSocketToRoom(socket.id, room.code, playerId);

      cb?.({ ok: true, code: room.code, snapshot: buildSnapshot(room.code) });
      io.to(room.code).emit("room:update", buildSnapshot(room.code));
    }
  );

  // Host selects game for this room
  // Host selects game for this room (does NOT start it).
socket.on(
  "room:setGame",
  (
    { code, byPlayerId, gameId }: { code: string; byPlayerId: string; gameId: string },
    cb: (res: any) => void
  ) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
    if (!isHostId(room, byPlayerId)) return cb?.({ ok: false, error: "NOT_HOST" });

    const adapter = getGameAdapter(gameId);
    if (!adapter) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });

    // reset readiness when game changes
    for (const p of room.players) p.ready = false;

    room.game = { id: gameId, status: "selected", state: null };
    touchRoom(room, now);

    io.to(code).emit("room:update", buildSnapshot(code));
    cb?.({ ok: true });
  }
);

// Host starts the selected game (initializes game state).
socket.on(
  "room:startGame",
  ({ code, byPlayerId }: { code: string; byPlayerId: string }, cb: (res: any) => void) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
    if (!isHostId(room, byPlayerId)) return cb?.({ ok: false, error: "NOT_HOST" });
    if (!room.game) return cb?.({ ok: false, error: "NO_GAME_SELECTED" });

    const adapter = getGameAdapter(room.game.id);
    if (!adapter) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });

    // Promote all connected spectators to players for the next game.
    for (const p of room.players) {
      if (p.connected) p.spectator = false;
      p.ready = false;
    }

    const playerIds = room.players.filter((p) => p.connected && !p.spectator).map((p) => p.playerId);
    if (playerIds.length < 4) return cb?.({ ok: false, error: "NEED_4_PLAYERS" });

    try {
      room.game = { id: room.game.id, status: "running", state: adapter.init(playerIds) };
    } catch (e) {
      socket.emit("room:error", { message: String(e), at: "room:startGame" });
      return cb?.({ ok: false, error: String(e) });
    }

    touchRoom(room, now);

    io.to(code).emit("room:update", buildSnapshot(code));
    // send secrets to each player (if game supports)
    for (const p of room.players) sendSecretTo(ctx, code, p.playerId);

    cb?.({ ok: true });
  }
);

  socket.on(
    "room:ready",
    ({ code, playerId, ready }: { code: string; playerId: string; ready: boolean }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });

      const p = room.players.find((x) => x.playerId === playerId);
      if (!p) return cb?.({ ok: false, error: "PLAYER_NOT_FOUND" });

      // Spectators are read-only until next game start.
      if (p.spectator) {
        io.to(code).emit("room:update", buildSnapshot(code));
        return cb?.({ ok: true, ignored: true });
      }

      p.ready = !!ready;
      markSeen(room, playerId, now);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on(
    "room:rename",
    ({ code, playerId, name }: { code: string; playerId: string; name: string }, cb: (res: any) => void) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: "room_not_found" });

      const p = room.players.find((x) => x.playerId === playerId);
      if (!p) return cb?.({ ok: false, error: "player_not_found" });

      // After Ready nickname is locked
      if (p.ready) return cb?.({ ok: false, error: "name_locked" });

      const safe = String(name ?? "").trim().slice(0, 24) || "Player";
      p.name = safe;

      touchRoom(room, now);
      ctx.io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );


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
      setEmptySinceIfNeeded(room, now);

      io.to(code).emit("room:update", buildSnapshot(code));
      cb?.({ ok: true });
    }
  );

  socket.on("disconnect", () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;

    const { room, playerId } = found;

    markDisconnected(room, playerId, now);
    setEmptySinceIfNeeded(room, now);

    io.to(room.code).emit("room:update", buildSnapshot(room.code));
    unbindSocket(socket.id);
  });
}
