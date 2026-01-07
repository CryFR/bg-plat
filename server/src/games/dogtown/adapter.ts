// server/src/games/dogtown/adapter.ts
import type { GameAdapter } from "../types.js";
import { initDogtown } from "./rules.js";
import { registerDogtownSocketHandlers } from "./socket.js";
import { buildDogtownPublicState, buildDogtownSecretState } from "./views.js";

export const dogtownAdapter: GameAdapter = {
  id: "dogtown",

  init: (playerIds) => initDogtown(playerIds),

  buildPublicState: (state) => buildDogtownPublicState(state),

  buildSecretState: (state, playerId) => buildDogtownSecretState(state, playerId),

  registerSocketHandlers: (ctx, socket) => {
    registerDogtownSocketHandlers(ctx, socket);
  },
};
