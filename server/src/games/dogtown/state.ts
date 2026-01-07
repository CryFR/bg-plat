// server/src/games/dogtown/state.ts

export type PlayerId = string;
export type CellId = number; // 1..85

export type DogtownPhase = "deeds" | "tiles" | "trade" | "build" | "income" | "end";

export type BuildingTypeSize = 3 | 4 | 5 | 6;

export type BuildingToken = {
  /** unique instance id */
  id: string;
  /** building kind id */
  kind: string;
  /** cluster target size (3/4/5/6) */
  size: BuildingTypeSize;
};

export type DogtownState = {
  playerIds: PlayerId[];
  round: number; // 1..6
  phase: DogtownPhase;

  firstPlayerIdx: number;
  /** Build is simultaneous: per-player completion flag */
  buildDone: Record<PlayerId, boolean>;

  owners: Record<CellId, PlayerId | null>;
  placed: Record<CellId, BuildingToken | null>;

  money: Record<PlayerId, number>;

  deedDeck: number[];
  tokenBag: BuildingToken[];

  hands: {
    deeds: Record<PlayerId, number[]>;
    deedsKeep: Record<PlayerId, number[]>;
    tokens: Record<PlayerId, BuildingToken[]>;
  };

  ready: Record<PlayerId, boolean>;
  log: string[];
};
