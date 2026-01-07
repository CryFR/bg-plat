export type Player = {
  playerId: string;
  socketId: string;
  name: string;
  color?: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  spectator?: boolean;
};

export type RoomSnapshot = {
  code: string;
  hostId: string | null;
  players: Player[];
  game?: {
    id: string;
    // server-specific; games decide how to interpret
    public?: unknown;
  } | null;
  // Any other fields the server includes:
  [k: string]: unknown;
};

export type JoinRoomRequest = { code: string; name: string; playerId: string };
export type JoinRoomResponse =
  | { ok: true; snapshot: RoomSnapshot }
  | { ok: false; error: string; reason?: string };
