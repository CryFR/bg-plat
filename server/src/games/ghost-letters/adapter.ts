// server/src/games/ghost-letters/adapter.ts
import type { GameAdapter } from "../types.js";
import { initGhostLetters } from "./rules.js";
import { buildPublicState, buildSecretState } from "./views.js";
import { registerGhostLettersHandlers } from "./socket.js";

export const ghostLettersAdapter: GameAdapter = {
  id: "ghost-letters",
  init: (playerIds) => initGhostLetters(playerIds),
  buildPublicState: (state) => buildPublicState(state),
  buildSecretState: (state, playerId) => buildSecretState(state, playerId),
  registerSocketHandlers: (ctx, socket) => registerGhostLettersHandlers(ctx, socket),
};
