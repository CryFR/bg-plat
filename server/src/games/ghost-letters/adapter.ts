// server/src/games/ghost-letters/adapter.ts
import type { GameAdapter } from "../types.js";
import { initGhostLetters } from "./rules.js";
import type { GhostLettersState } from "./state.js";
import { buildPublicState, buildSecretState } from "./views.js";
import { registerGhostLettersHandlers } from "./socket.js";

function createWaitingState(playerIds: string[], reason = "Need 4+ players"): GhostLettersState {
  const board = { MOTIVE: [], PLACE: [], METHOD: [] } as any;

  const draftCardByPlayerId: Record<string, any> = {};
  const hands: Record<string, any[]> = {};
  const discardedThisRound: Record<string, boolean> = {};
  for (const pid of playerIds) {
    draftCardByPlayerId[pid] = null;
    hands[pid] = [];
    discardedThisRound[pid] = false;
  }

  return {
    phase: "WAITING_FOR_PLAYERS",
    round: 0,

    roles: {},

    setup: {
      deck: [],
      board,
      currentTurnPlayerId: playerIds[0] ?? "",
      turnOrder: [...playerIds],
      draftCardByPlayerId,
    },

    table: { motive: [], place: [], method: [] },

    caseFile: null,

    hands,
    mailbox: {},

    roundHints: [],
    revealedHints: [],

    discard: [],
    vanished: [],

    discardedThisRound,

    reactions: {},

    voteHistory: [],

    public: {
      waiting: { minPlayers: 4, currentPlayers: playerIds.length, reason },
    },
  } as any;
}

export const ghostLettersAdapter: GameAdapter = {
  id: "ghost-letters",
  init: (playerIds) => {
    if ((playerIds?.length ?? 0) < 4) return createWaitingState(playerIds ?? []);
    return initGhostLetters(playerIds);
  },
  buildPublicState: (state) => buildPublicState(state as any),
  buildSecretState: (state, playerId) => buildSecretState(state as any, playerId),
  registerSocketHandlers: (ctx, socket) => registerGhostLettersHandlers(ctx, socket),
};
