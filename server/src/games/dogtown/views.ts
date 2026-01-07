// server/src/games/dogtown/views.ts
import type { DogtownState } from "./state.js";

export function buildDogtownPublicState(state: DogtownState) {
  // Пока отдаем минимум — этого достаточно, чтобы фронт понимал, что игра есть.
  return {
    phase: state.phase,
    players: state.playerIds,
  };
}

export function buildDogtownSecretState(_state: DogtownState, _playerId: string) {
  // Секретов пока нет.
  return {};
}
