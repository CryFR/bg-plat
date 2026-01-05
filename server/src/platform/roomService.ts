// server/src/platform/roomService.ts
import type { Room } from "./types.js";

export function touchRoom(room: Room, now: () => number) {
  room.lastActiveAt = now();
  room.emptySince = null;
}

export function markSeen(room: Room, playerId: string, now: () => number) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;
  p.lastSeen = now();
  p.connected = true;
  room.lastActiveAt = now();
}

export function markDisconnected(room: Room, playerId: string, now: () => number) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return;
  p.connected = false;
  p.lastSeen = now();
}

export function ensureHost(room: Room) {
  if (room.players.some((p) => p.isHost)) return;
  if (room.players[0]) room.players[0].isHost = true;
}

export function removePlayer(room: Room, playerId: string) {
  room.players = room.players.filter((p) => p.playerId !== playerId);
  ensureHost(room);
}

export function isHostId(room: Room, playerId: string) {
  return !!room.players.find((p) => p.playerId === playerId)?.isHost;
}

export function setEmptySinceIfNeeded(room: Room, now: () => number) {
  const anyConnected = room.players.some((p) => p.connected);
  if (!anyConnected) room.emptySince = room.emptySince ?? now();
  else room.emptySince = null;
}
