// server/src/games/types.ts
import type { Socket } from "socket.io";
import type { ServerContext, Room } from "../platform/types.js";

export type GameAdapter = {
  id: string;

  /** Create initial game state given list of playerIds (stable ids) */
  init: (playerIds: string[]) => any;

  /** Build public state for room snapshot (no secrets) */
  buildPublicState: (state: any) => any;

  /** Build secret payload for a single player (role, hand, etc.) */
  buildSecretState: (state: any, playerId: string) => any;

  /** Optionally build extra secret payload for special role (e.g. ghost mailbox) */
  buildExtraSecrets?: (state: any, room: Room) => void;

  /** Register all socket handlers for this game */
  registerSocketHandlers: (ctx: ServerContext, socket: Socket) => void;
};
