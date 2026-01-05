// server/src/rooms.ts
import type { Room, Player } from "./types";

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

export function createRoom(): Room {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();

  const room: Room = {
    code,
    createdAt: Date.now(),
    players: [],
    game: null,
    emptySince: null,
    lastActiveAt: Date.now(),
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

export function ensureHost(room: Room) {
  if (room.players.some((p) => p.isHost)) return;
  if (room.players[0]) room.players[0].isHost = true;
}

export function removePlayer(room: Room, playerId: string) {
  room.players = room.players.filter((p) => p.playerId !== playerId);
  ensureHost(room);
}
