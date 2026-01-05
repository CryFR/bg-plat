// server/src/platform/types.ts
import type { Server } from "socket.io";

export type RoomCode = string;

export type Player = {
  playerId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
};

export type RoomGame = {
  id: string;
  state: any;
};

export type Room = {
  code: RoomCode;
  players: Player[];
  game: RoomGame | null;

  createdAt: number;

  // housekeeping
  emptySince: number | null;
  lastActiveAt: number;
};

export type ClientPlayer = {
  playerId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
};

export type ClientRoomSnapshot = {
  code: string;
  players: ClientPlayer[];
  game: null | {
    id: string;
    state: any; // public (no secrets)
  };
};

export type ServerContext = {
  io: Server;
  config: {
    PORT: number;
    CORS_ORIGIN: true | string[];
    CREATE_RATE_LIMIT_MS: number;
    EMPTY_ROOM_TTL_MS: number;
    PLAYER_INACTIVE_AFTER_MS: number;
    CLEANUP_TICK_MS: number;
  };
  now: () => number;
};
