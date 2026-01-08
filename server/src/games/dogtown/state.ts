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

// --- Trade (scaffold) ---
// Trades happen during phase "trade". Tokens are public, money is secret.
// We keep offers in state so that UI can render them later.

export type TradeOffer = {
  id: string;
  from: PlayerId;
  /** if undefined/null -> open offer anyone can accept */
  to?: PlayerId | null;
  giveMoney: number;
  takeMoney: number;
  giveTokenIds: string[];
  takeTokenIds: string[];
  createdAt: number;
};

export type TradeSide = {
  money: number;
  tokenIds: string[];
  /** owned cells to swap (may already contain a built business) */
  cellIds: CellId[];
  committed: boolean;
};

export type TradeSessionStatus = "pending" | "open";

/**
 * Two-party trade session: one player sends request, the other accepts, then both fill in what they offer.
 * When both commit, server executes the swap.
 */
export type TradeSession = {
  id: string;
  a: PlayerId;
  b: PlayerId;
  status: TradeSessionStatus;
  createdAt: number;
  sideA: TradeSide;
  sideB: TradeSide;
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

  trade: {
    offers: TradeOffer[];
    sessions: TradeSession[];
  };

  ready: Record<PlayerId, boolean>;
  log: string[];
};
