// server/src/platform/types.ts
import type { Server } from "socket.io";

export type RoomCode = string;

export type Player = {
  playerId: string;
  socketId: string;
  name: string;
  /** UI color assigned on first join; stable across reconnects */
  color: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
  /** Joined after game started. Spectators watch only until next game start. */
  spectator?: boolean;
};

export type RoomGameStatus = "selected" | "running";

export type RoomGame = {
  id: string;
  status: RoomGameStatus;
  state: any | null;
};

export type Room = {
  code: RoomCode;
  players: Player[];
  game: RoomGame | null;
  createdAt: number;
  lastActiveAt: number;
  emptySince: number | null;
};

export type ClientPlayer = {
  playerId: string;
  socketId: string;
  name: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  spectator?: boolean;
};

export type ClientRoomSnapshot = {
  code: RoomCode;
  players: ClientPlayer[];
  game: null | {
    id: string;
    status: RoomGameStatus;
    state?: unknown; // public state (no secrets)
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
