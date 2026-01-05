// server/src/platform/roomStore.ts
import type { Room } from "./types.js";

const rooms = new Map<string, Room>();

// socket.id -> { code, playerId }
export const socketIndex = new Map<string, { code: string; playerId: string }>();

export function makeCode(len = 5) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function getRoom(code: string) {
  return rooms.get(code);
}

export function createRoom(now: () => number): Room {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();

  const t = now();
  const room: Room = {
    code,
    createdAt: t,
    players: [],
    game: null,
    emptySince: null,
    lastActiveAt: t,
  };

  rooms.set(code, room);
  return room;
}

export function deleteRoom(code: string) {
  rooms.delete(code);
}

export function allRooms() {
  return rooms;
}

export function findRoomBySocketId(socketId: string): { room: Room; playerId: string } | null {
  const entry = socketIndex.get(socketId);
  if (!entry) return null;

  const room = rooms.get(entry.code);
  if (!room) return null;

  return { room, playerId: entry.playerId };
}

export function bindSocketToRoom(socketId: string, code: string, playerId: string) {
  socketIndex.set(socketId, { code, playerId });
}

export function unbindSocket(socketId: string) {
  socketIndex.delete(socketId);
}
