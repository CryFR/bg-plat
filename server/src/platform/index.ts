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

  const adapter = getGameAdapter(room.game.id);
  if (!adapter) return;

  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;

  ctx.io.to(p.socketId).emit("me:secret", adapter.buildSecretState(room.game.state, playerId));
}

export function registerPlatform(ctx: ServerContext) {
  ctx.io.on("connection", (socket) => {
    registerRoomHandlers(ctx, socket);

    // register all games on this socket
    for (const adapter of allGameAdapters()) {
      adapter.registerSocketHandlers(ctx, socket);
    }
  });
}

function registerRoomHandlers(ctx: ServerContext, socket: Socket) {
  const { io, now, config } = ctx;

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
    ({ name, playerId }: { name: string; playerId: string }, cb: (res: any) => void) => {
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
      };

      room.players.push(host);
      touchRoom(room, now);

      socket.join(room.code);
      bindSocketToRoom(socket.id, room.code, playerId);

      cb?.({ ok: true, code: room.code, snapshot: buildSnapshot(room.code) });
      io.to(room.code).emit("room:update", buildSnapshot(room.code));
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
      markSeen(room, playerId, now);

      io.to(code).emit("room:update", buildSnapshot(code));
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
