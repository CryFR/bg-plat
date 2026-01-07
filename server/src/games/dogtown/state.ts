// server/src/games/dogtown/state.ts

export type DogtownState = {
  /** Stable list of player ids in this match */
  playerIds: string[];

  /** Placeholder for future game engine state */
  phase: "board";
};
