// server/src/games/dogtown/rules.ts
import type { DogtownState } from "./state.js";

export function initDogtown(playerIds: string[]): DogtownState {
  return {
    playerIds: [...playerIds],
    phase: "board",
  };
}
