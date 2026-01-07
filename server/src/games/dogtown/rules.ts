// server/src/games/dogtown/rules.ts
import type { BuildingToken, DogtownState, PlayerId, CellId, BuildingTypeSize } from "./state.js";

// --- Board geometry (copied from web/lib/games/dogtown/Room.tsx) ---
// Used ONLY for orthogonal adjacency in cluster/income calculations.

type CellXY = { n: number; x: number; y: number };

function withOffset(cells: CellXY[], ox: number, oy: number): CellXY[] {
  return cells.map((c) => ({ ...c, x: c.x + ox, y: c.y + oy }));
}

const A: CellXY[] = [
  { n: 1, x: 0, y: 0 }, { n: 2, x: 1, y: 0 },
  { n: 3, x: 0, y: 1 }, { n: 4, x: 1, y: 1 }, { n: 5, x: 2, y: 1 },
  { n: 6, x: -1, y: 2 }, { n: 7, x: 0, y: 2 }, { n: 8, x: 1, y: 2 }, { n: 9, x: 2, y: 2 },
  { n: 10, x: 0, y: 3 }, { n: 11, x: 1, y: 3 }, { n: 12, x: 2, y: 3 },
  { n: 13, x: 0, y: 4 }, { n: 14, x: 1, y: 4 }, { n: 15, x: 2, y: 4 },
];

const B: CellXY[] = [
  { n: 16, x: 0, y: 0 }, { n: 17, x: 1, y: 0 }, { n: 18, x: 2, y: 0 },
  { n: 19, x: 0, y: 1 }, { n: 20, x: 1, y: 1 }, { n: 21, x: 2, y: 1 },
  { n: 22, x: 0, y: 2 }, { n: 23, x: 1, y: 2 },
  { n: 24, x: 0, y: 3 }, { n: 25, x: 1, y: 3 },
  { n: 26, x: 0, y: 4 }, { n: 27, x: 1, y: 4 },
];

const C: CellXY[] = [
  { n: 28, x: 0, y: 0 }, { n: 29, x: 1, y: 0 }, { n: 30, x: 2, y: 0 },
  { n: 31, x: 0, y: 1 }, { n: 32, x: 1, y: 1 }, { n: 33, x: 2, y: 1 },
  { n: 34, x: 0, y: 2 }, { n: 35, x: 1, y: 2 }, { n: 36, x: 2, y: 2 },
  { n: 37, x: 1, y: 3 }, { n: 38, x: 2, y: 3 }, { n: 39, x: 3, y: 3 },
  { n: 40, x: 1, y: 4 }, { n: 41, x: 2, y: 4 }, { n: 42, x: 3, y: 4 },
];

const D: CellXY[] = [
  { n: 43, x: 0, y: 0 }, { n: 44, x: 1, y: 0 }, { n: 45, x: 2, y: 0 }, { n: 46, x: 3, y: 0 },
  { n: 47, x: 0, y: 1 }, { n: 48, x: 1, y: 1 }, { n: 49, x: 2, y: 1 }, { n: 50, x: 3, y: 1 },
  { n: 51, x: 0, y: 2 }, { n: 52, x: 1, y: 2 }, { n: 53, x: 2, y: 2 }, { n: 54, x: 3, y: 2 },
  { n: 55, x: 2, y: 3 }, { n: 56, x: 3, y: 3 },
  { n: 57, x: 2, y: 4 }, { n: 58, x: 3, y: 4 },
];

const E: CellXY[] = [
  { n: 59, x: 0, y: 0 }, { n: 60, x: 1, y: 0 },
  { n: 61, x: 0, y: 1 }, { n: 62, x: 1, y: 1 },
  { n: 63, x: 0, y: 2 }, { n: 64, x: 1, y: 2 }, { n: 65, x: 2, y: 2 },
  { n: 66, x: 0, y: 3 }, { n: 67, x: 1, y: 3 }, { n: 68, x: 2, y: 3 },
  { n: 69, x: 1, y: 4 }, { n: 70, x: 2, y: 4 },
];

const F: CellXY[] = [
  { n: 71, x: 0, y: 0 }, { n: 72, x: 1, y: 0 }, { n: 73, x: 2, y: 0 }, { n: 74, x: 3, y: 0 },
  { n: 75, x: 0, y: 1 }, { n: 76, x: 1, y: 1 }, { n: 77, x: 2, y: 1 }, { n: 78, x: 3, y: 1 },
  { n: 79, x: 0, y: 2 }, { n: 80, x: 1, y: 2 }, { n: 81, x: 2, y: 2 }, { n: 82, x: 3, y: 2 },
  { n: 83, x: 0, y: 3 }, { n: 84, x: 1, y: 3 }, { n: 85, x: 2, y: 3 },
];

const CELL_LIST: CellXY[] = [
  ...withOffset(A, 0, 0),
  ...withOffset(B, 4, 0),
  ...withOffset(C, 8, 0),
  ...withOffset(D, 12, 0),
  ...withOffset(E, 5, 6),
  ...withOffset(F, 10, 6),
];

const CELL_BY_ID = new Map<number, CellXY>(CELL_LIST.map((c) => [c.n, c]));

function areAdjacent(a: number, b: number): boolean {
  const ca = CELL_BY_ID.get(a);
  const cb = CELL_BY_ID.get(b);
  if (!ca || !cb) return false;
  const dx = Math.abs(ca.x - cb.x);
  const dy = Math.abs(ca.y - cb.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

// ---------- Config ----------

// Deed schedule: [deal, keep] per round (6 rounds). Matches rules table (3-5 players).
const DEAL_KEEP: Record<3 | 4 | 5, Array<[deal: number, keep: number]>> = {
  3: [[7, 5], [6, 4], [6, 4], [6, 4], [6, 4], [6, 4]],
  4: [[6, 4], [5, 3], [5, 3], [5, 3], [5, 3], [5, 3]],
  5: [[5, 3], [5, 3], [5, 3], [4, 2], [4, 2], [4, 2]],
};

// Income table (numbers can be tuned to match your PDF exactly).
const INCOME_PARTIAL: Record<number, number> = {
  0: 0,
  1: 10_000,
  2: 20_000,
  3: 30_000,
  4: 40_000,
  5: 50_000,
};

const INCOME_FULL: Record<BuildingTypeSize, number> = {
  3: 40_000,
  4: 70_000,
  5: 110_000,
  6: 160_000,
};

const START_MONEY = 50_000;
const MAX_ROUNDS = 6;
const BOARD_CELLS = 85;

// 12 building kinds; amount per kind = (size + 3)
// That gives exactly 90 business tiles total:
//  - size 3 => 6 copies (3 + 3)
//  - size 4 => 7 copies (4 + 3)
//  - size 5 => 8 copies (5 + 3)
//  - size 6 => 9 copies (6 + 3)
// With 3 kinds for each size: 3*(6+7+8+9)=90.
// Animal-themed names are UI-only; here we store compact kind ids.
const BUILDINGS: Array<{ kind: string; size: BuildingTypeSize }> = [
  // size 3 (6 copies each)
  { kind: "dog_store", size: 3 },
  { kind: "cat_store", size: 3 },
  { kind: "vet_clinic", size: 3 },

  // size 4 (7 copies each)
  { kind: "grooming", size: 4 },
  { kind: "aquarium", size: 4 },
  { kind: "bird_shop", size: 4 },

  // size 5 (8 copies each)
  { kind: "pet_hotel", size: 5 },
  { kind: "pet_food", size: 5 },
  { kind: "toy_shop", size: 5 },

  // size 6 (9 copies each)
  { kind: "shelter", size: 6 },
  { kind: "exotic_pets", size: 6 },
  { kind: "training", size: 6 },
];

// ---------- Helpers ----------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeedDeck(): number[] {
  const deck = Array.from({ length: BOARD_CELLS }, (_, i) => i + 1);
  return shuffle(deck);
}

function makeTokenBag(): BuildingToken[] {
  const bag: BuildingToken[] = [];
  let seq = 1;
  for (const b of BUILDINGS) {
    const count = b.size + 3;
    for (let i = 0; i < count; i++) {
      bag.push({ id: `t${seq++}`, kind: b.kind, size: b.size });
    }
  }
  return shuffle(bag);
}

function emptyOwners(): Record<CellId, PlayerId | null> {
  const r: Record<number, PlayerId | null> = {};
  for (let i = 1; i <= BOARD_CELLS; i++) r[i] = null;
  return r as any;
}

function emptyPlaced(): Record<CellId, BuildingToken | null> {
  const r: Record<number, BuildingToken | null> = {};
  for (let i = 1; i <= BOARD_CELLS; i++) r[i] = null;
  return r as any;
}

function playersCountKey(playerIds: string[]): 3 | 4 | 5 {
  const n = playerIds.length;
  if (n === 3 || n === 4 || n === 5) return n;
  // Default to 4-player schedule for non-standard counts.
  return 4;
}

function drawN<T>(from: T[], n: number): { drawn: T[]; rest: T[] } {
  return { drawn: from.slice(0, n), rest: from.slice(n) };
}

// ---------- Init ----------

export function initDogtown(playerIds: string[]): DogtownState {
  const deedDeck = makeDeedDeck();
  const tokenBag = makeTokenBag();

  const money: Record<PlayerId, number> = {};
  const ready: Record<PlayerId, boolean> = {};
  const buildDone: Record<PlayerId, boolean> = {};
  const deeds: Record<PlayerId, number[]> = {};
  const deedsKeep: Record<PlayerId, number[]> = {};
  const tokens: Record<PlayerId, BuildingToken[]> = {};

  for (const pid of playerIds) {
    money[pid] = START_MONEY;
    ready[pid] = false;
    buildDone[pid] = false;
    deeds[pid] = [];
    deedsKeep[pid] = [];
    tokens[pid] = [];
  }

  const state: DogtownState = {
    playerIds: [...playerIds],
    round: 1,
    phase: "deeds",
    firstPlayerIdx: 0,
    buildDone,
    owners: emptyOwners(),
    placed: emptyPlaced(),
    money,
    deedDeck,
    tokenBag,
    hands: { deeds, deedsKeep, tokens },
    trade: { offers: [], sessions: [] },
    ready,
    log: [],
  };

  dealDeeds(state);
  return state;
}

// ---------- Phase logic ----------

export function dealDeeds(state: DogtownState) {
  const k = playersCountKey(state.playerIds);
  const [deal] = DEAL_KEEP[k][state.round - 1];

  state.log.push(`Round ${state.round}: dealing deeds (${deal})`);

  for (const pid of state.playerIds) {
    state.ready[pid] = false;
    state.hands.deedsKeep[pid] = [];
  }

  for (const pid of state.playerIds) {
    const r = drawN(state.deedDeck, deal);
    state.hands.deeds[pid] = r.drawn;
    state.deedDeck = r.rest;
  }
}

export function submitDeedsKeep(state: DogtownState, playerId: PlayerId, keep: number[]) {
  if (state.phase !== "deeds") return { ok: false, error: "WRONG_PHASE" } as const;

  const k = playersCountKey(state.playerIds);
  const [, keepCount] = DEAL_KEEP[k][state.round - 1];

  const dealt = new Set(state.hands.deeds[playerId] || []);
  const uniq = Array.from(new Set(keep));

  if (uniq.length !== keepCount) return { ok: false, error: "BAD_KEEP_COUNT" } as const;
  for (const c of uniq) if (!dealt.has(c)) return { ok: false, error: "UNKNOWN_CARD" } as const;

  const discard = (state.hands.deeds[playerId] || []).filter((c) => !uniq.includes(c));
  state.deedDeck = shuffle([...state.deedDeck, ...discard]);

  state.hands.deedsKeep[playerId] = uniq;
  state.ready[playerId] = true;

  if (state.playerIds.every((pid) => state.ready[pid])) {
    revealAndPlaceOwners(state);
    startTiles(state);
  }

  return { ok: true } as const;
}

function revealAndPlaceOwners(state: DogtownState) {
  state.log.push(`Round ${state.round}: reveal deeds & place owners`);
  for (const pid of state.playerIds) {
    const keep = state.hands.deedsKeep[pid] || [];
    for (const cell of keep) state.owners[cell] = pid;
  }
}

function startTiles(state: DogtownState) {
  state.phase = "tiles";
  for (const pid of state.playerIds) state.ready[pid] = false;

  const k = playersCountKey(state.playerIds);
  const [, keepCount] = DEAL_KEEP[k][state.round - 1];
  const tokenCount = keepCount;

  for (let i = 0; i < state.playerIds.length; i++) {
    const pid = state.playerIds[(state.firstPlayerIdx + i) % state.playerIds.length];
    const r = drawN(state.tokenBag, tokenCount);
    state.hands.tokens[pid] = [...(state.hands.tokens[pid] || []), ...r.drawn];
    state.tokenBag = r.rest;
  }

  state.log.push(`Round ${state.round}: dealt tokens (${tokenCount} each)`);
  state.phase = "trade";
  // reset trade offers for this round
  state.trade.offers = [];
}

export function endTrade(state: DogtownState) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  // clear any outstanding offers
  state.trade.offers = [];
  state.phase = "build";
  // Build is simultaneous: everyone can place on their own lots until they mark done.
  for (const pid of state.playerIds) state.buildDone[pid] = false;
  state.log.push(`Round ${state.round}: build phase start`);
  return { ok: true } as const;
}

// ---------- Trade scaffolding ----------

function genOfferId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function tradeCreateOffer(
  state: DogtownState,
  from: PlayerId,
  payload: {
    to?: PlayerId | null;
    giveMoney?: number;
    takeMoney?: number;
    giveTokenIds?: string[];
    takeTokenIds?: string[];
  }
) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  if (!state.playerIds.includes(from)) return { ok: false, error: "NO_PLAYER" } as const;

  const giveMoney = Math.max(0, Number(payload.giveMoney ?? 0) || 0);
  const takeMoney = Math.max(0, Number(payload.takeMoney ?? 0) || 0);
  const giveTokenIds = Array.from(new Set((payload.giveTokenIds ?? []).map(String)));
  const takeTokenIds = Array.from(new Set((payload.takeTokenIds ?? []).map(String)));

  // basic sanity: offer must exchange something
  if (giveMoney === 0 && takeMoney === 0 && giveTokenIds.length === 0 && takeTokenIds.length === 0) {
    return { ok: false, error: "EMPTY_OFFER" } as const;
  }

  // Soft validation (no reservation): creator must currently own what they promise to give.
  if ((state.money[from] ?? 0) < giveMoney) return { ok: false, error: "NO_MONEY" } as const;
  const fromTokens = state.hands.tokens[from] || [];
  for (const id of giveTokenIds) {
    if (!fromTokens.some((t) => t.id === id)) return { ok: false, error: "NO_TOKEN" } as const;
  }

  const offer = {
    id: genOfferId(),
    from,
    to: payload.to ?? null,
    giveMoney,
    takeMoney,
    giveTokenIds,
    takeTokenIds,
    createdAt: Date.now(),
  };
  state.trade.offers.push(offer);
  state.log.push(`Trade: ${from} offered (${giveTokenIds.length} tokens + ${giveMoney}) for (${takeTokenIds.length} tokens + ${takeMoney})`);
  return { ok: true, offerId: offer.id } as const;
}

export function tradeCancelOffer(state: DogtownState, from: PlayerId, offerId: string) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  const before = state.trade.offers.length;
  state.trade.offers = state.trade.offers.filter((o) => !(o.id === offerId && o.from === from));
  if (state.trade.offers.length === before) return { ok: false, error: "NOT_FOUND" } as const;
  state.log.push(`Trade: ${from} cancelled offer`);
  return { ok: true } as const;
}

function removeTokenById(tokens: BuildingToken[], id: string) {
  const idx = tokens.findIndex((t) => t.id === id);
  if (idx < 0) return { ok: false as const, tokens };
  const token = tokens[idx];
  return { ok: true as const, token, tokens: [...tokens.slice(0, idx), ...tokens.slice(idx + 1)] };
}

export function tradeAcceptOffer(state: DogtownState, accepter: PlayerId, offerId: string) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  if (!state.playerIds.includes(accepter)) return { ok: false, error: "NO_PLAYER" } as const;
  const offer = state.trade.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, error: "NOT_FOUND" } as const;
  if (offer.from === accepter) return { ok: false, error: "SELF" } as const;
  if (offer.to && offer.to !== accepter) return { ok: false, error: "NOT_FOR_YOU" } as const;

  const from = offer.from;
  const to = accepter;

  // hard validation at accept time
  if ((state.money[from] ?? 0) < offer.giveMoney) return { ok: false, error: "FROM_NO_MONEY" } as const;
  if ((state.money[to] ?? 0) < offer.takeMoney) return { ok: false, error: "TO_NO_MONEY" } as const;

  let fromTokens = state.hands.tokens[from] || [];
  let toTokens = state.hands.tokens[to] || [];

  const giveTokens: BuildingToken[] = [];
  for (const id of offer.giveTokenIds) {
    const r = removeTokenById(fromTokens, id);
    if (!r.ok) return { ok: false, error: "FROM_NO_TOKEN" } as const;
    fromTokens = r.tokens;
    giveTokens.push(r.token);
  }

  const takeTokens: BuildingToken[] = [];
  for (const id of offer.takeTokenIds) {
    const r = removeTokenById(toTokens, id);
    if (!r.ok) return { ok: false, error: "TO_NO_TOKEN" } as const;
    toTokens = r.tokens;
    takeTokens.push(r.token);
  }

  // money transfer
  state.money[from] = (state.money[from] ?? 0) - offer.giveMoney + offer.takeMoney;
  state.money[to] = (state.money[to] ?? 0) - offer.takeMoney + offer.giveMoney;

  // token transfer
  state.hands.tokens[from] = [...fromTokens, ...takeTokens];
  state.hands.tokens[to] = [...toTokens, ...giveTokens];

  // remove offers that involve transferred tokens (they changed ownership)
  const movedIds = new Set([...offer.giveTokenIds, ...offer.takeTokenIds]);
  state.trade.offers = state.trade.offers.filter((o) => {
    if (o.id === offer.id) return false;
    if (o.from !== from && o.from !== to) return true;
    for (const id of o.giveTokenIds) if (movedIds.has(id)) return false;
    for (const id of o.takeTokenIds) if (movedIds.has(id)) return false;
    return true;
  });

  state.log.push(`Trade: ${from} <-> ${to} accepted`);
  return { ok: true } as const;
}

// ---------- Trade sessions (request -> shared trade panel) ----------

function findSession(state: DogtownState, sessionId: string) {
  return state.trade.sessions.find((s) => s.id === sessionId);
}

function sessionSide(session: any, playerId: PlayerId) {
  if (session.a === playerId) return { me: session.sideA, other: session.sideB, meKey: "A" as const };
  if (session.b === playerId) return { me: session.sideB, other: session.sideA, meKey: "B" as const };
  return null;
}

export function tradeRequest(state: DogtownState, from: PlayerId, to: PlayerId) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  if (!state.playerIds.includes(from) || !state.playerIds.includes(to)) return { ok: false, error: "NO_PLAYER" } as const;
  if (from === to) return { ok: false, error: "SELF" } as const;

  // prevent duplicates
  const exists = state.trade.sessions.some(
    (s) => (s.a === from && s.b === to) || (s.a === to && s.b === from)
  );
  if (exists) return { ok: false, error: "ALREADY_EXISTS" } as const;

  const id = genSessionId();
  state.trade.sessions.push({
    id,
    a: from,
    b: to,
    status: "pending",
    createdAt: Date.now(),
    sideA: { money: 0, tokenIds: [], committed: false },
    sideB: { money: 0, tokenIds: [], committed: false },
  });
  state.log.push(`Trade: ${from} requested trade with ${to}`);
  return { ok: true, sessionId: id } as const;
}

export function tradeRespond(state: DogtownState, playerId: PlayerId, sessionId: string, accept: boolean) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  const s = findSession(state, sessionId);
  if (!s) return { ok: false, error: "NOT_FOUND" } as const;
  if (s.b !== playerId) return { ok: false, error: "NOT_FOR_YOU" } as const;
  if (s.status !== "pending") return { ok: false, error: "BAD_STATE" } as const;

  if (!accept) {
    state.trade.sessions = state.trade.sessions.filter((x) => x.id !== sessionId);
    state.log.push(`Trade: ${playerId} declined trade`);
    return { ok: true, declined: true } as const;
  }

  s.status = "open";
  state.log.push(`Trade: session ${sessionId} opened`);
  return { ok: true } as const;
}

export function tradeUpdateSession(state: DogtownState, playerId: PlayerId, sessionId: string, payload: { money?: number; tokenIds?: string[] }) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  const s = findSession(state, sessionId);
  if (!s) return { ok: false, error: "NOT_FOUND" } as const;
  if (s.status !== "open") return { ok: false, error: "BAD_STATE" } as const;

  const side = sessionSide(s, playerId);
  if (!side) return { ok: false, error: "NOT_IN_SESSION" } as const;

  const money = Math.max(0, Math.floor(Number(payload.money ?? side.me.money) || 0));
  const tokenIds = Array.from(new Set((payload.tokenIds ?? side.me.tokenIds).map(String)));

  // validate ownership (no reservation): player must currently have these tokens & money
  if ((state.money[playerId] ?? 0) < money) return { ok: false, error: "NO_MONEY" } as const;
  const myTokens = state.hands.tokens[playerId] || [];
  for (const id of tokenIds) {
    if (!myTokens.some((t) => t.id === id)) return { ok: false, error: "NO_TOKEN" } as const;
  }

  side.me.money = money;
  side.me.tokenIds = tokenIds;
  // editing invalidates commit
  side.me.committed = false;
  state.log.push(`Trade: ${playerId} updated session ${sessionId}`);
  return { ok: true } as const;
}

export function tradeCommitSession(state: DogtownState, playerId: PlayerId, sessionId: string, committed: boolean) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  const s = findSession(state, sessionId);
  if (!s) return { ok: false, error: "NOT_FOUND" } as const;
  if (s.status !== "open") return { ok: false, error: "BAD_STATE" } as const;
  const side = sessionSide(s, playerId);
  if (!side) return { ok: false, error: "NOT_IN_SESSION" } as const;

  side.me.committed = !!committed;

  // if both committed -> execute swap
  if (s.sideA.committed && s.sideB.committed) {
    const a = s.a;
    const b = s.b;

    // hard validate holdings at execution time
    if ((state.money[a] ?? 0) < s.sideA.money) return { ok: false, error: "A_NO_MONEY" } as const;
    if ((state.money[b] ?? 0) < s.sideB.money) return { ok: false, error: "B_NO_MONEY" } as const;

    let aTokens = state.hands.tokens[a] || [];
    let bTokens = state.hands.tokens[b] || [];

    const giveA: BuildingToken[] = [];
    for (const id of s.sideA.tokenIds) {
      const r = removeTokenById(aTokens, id);
      if (!r.ok) return { ok: false, error: "A_NO_TOKEN" } as const;
      aTokens = r.tokens;
      giveA.push(r.token);
    }

    const giveB: BuildingToken[] = [];
    for (const id of s.sideB.tokenIds) {
      const r = removeTokenById(bTokens, id);
      if (!r.ok) return { ok: false, error: "B_NO_TOKEN" } as const;
      bTokens = r.tokens;
      giveB.push(r.token);
    }

    // transfer money
    state.money[a] = (state.money[a] ?? 0) - s.sideA.money + s.sideB.money;
    state.money[b] = (state.money[b] ?? 0) - s.sideB.money + s.sideA.money;

    // transfer tokens
    state.hands.tokens[a] = [...aTokens, ...giveB];
    state.hands.tokens[b] = [...bTokens, ...giveA];

    state.trade.sessions = state.trade.sessions.filter((x) => x.id !== sessionId);
    state.log.push(`Trade: session ${sessionId} executed`);
    return { ok: true, executed: true } as const;
  }

  return { ok: true } as const;
}

export function tradeCancelSession(state: DogtownState, playerId: PlayerId, sessionId: string) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  const s = findSession(state, sessionId);
  if (!s) return { ok: false, error: "NOT_FOUND" } as const;
  if (s.a !== playerId && s.b !== playerId) return { ok: false, error: "NOT_IN_SESSION" } as const;
  state.trade.sessions = state.trade.sessions.filter((x) => x.id !== sessionId);
  state.log.push(`Trade: session ${sessionId} cancelled`);
  return { ok: true } as const;
}

export function buildPlace(state: DogtownState, playerId: PlayerId, cell: CellId, tokenId: string) {
  if (state.phase !== "build") return { ok: false, error: "WRONG_PHASE" } as const;
  if (state.buildDone[playerId]) return { ok: false, error: "ALREADY_DONE" } as const;

  if (cell < 1 || cell > BOARD_CELLS) return { ok: false, error: "BAD_CELL" } as const;
  if (state.owners[cell] !== playerId) return { ok: false, error: "NOT_OWNER" } as const;
  if (state.placed[cell]) return { ok: false, error: "CELL_OCCUPIED" } as const;

  const hand = state.hands.tokens[playerId] || [];
  const idx = hand.findIndex((t) => t.id === tokenId);
  if (idx < 0) return { ok: false, error: "NO_TOKEN" } as const;

  const token = hand[idx];
  state.placed[cell] = token;
  state.hands.tokens[playerId] = [...hand.slice(0, idx), ...hand.slice(idx + 1)];

  return { ok: true } as const;
}

export function buildDone(state: DogtownState, playerId: PlayerId) {
  if (state.phase !== "build") return { ok: false, error: "WRONG_PHASE" } as const;
  state.buildDone[playerId] = true;

  if (state.playerIds.every((pid) => state.buildDone[pid])) {
    state.phase = "income";
    applyIncome(state);
    advanceRoundOrEnd(state);
  }

  return { ok: true } as const;
}

function advanceRoundOrEnd(state: DogtownState) {
  if (state.round >= MAX_ROUNDS) {
    state.phase = "end";
    state.log.push("Game end");
    return;
  }

  state.round += 1;
  state.firstPlayerIdx = (state.firstPlayerIdx + 1) % state.playerIds.length;
  state.phase = "deeds";
  dealDeeds(state);
}

function applyIncome(state: DogtownState) {
  const visited = new Set<number>();
  const cells = Array.from({ length: BOARD_CELLS }, (_, i) => i + 1);

  function neighborsOf(c: number): number[] {
    const out: number[] = [];
    for (const n of cells) {
      if (areAdjacent(c, n)) out.push(n);
    }
    return out;
  }

  for (const c of cells) {
    if (visited.has(c)) continue;

    const token = state.placed[c];
    const owner = state.owners[c];

    if (!token || !owner) {
      visited.add(c);
      continue;
    }

    const q = [c];
    visited.add(c);
    const component: number[] = [];

    while (q.length) {
      const cur = q.pop()!;
      component.push(cur);

      for (const n of neighborsOf(cur)) {
        if (visited.has(n)) continue;
        const t2 = state.placed[n];
        const o2 = state.owners[n];
        if (!t2 || !o2) continue;
        if (o2 !== owner) continue;
        if (t2.kind !== token.kind) continue;

        visited.add(n);
        q.push(n);
      }
    }

    const T = token.size;
    const S = component.length;

    const full = Math.floor(S / T);
    const rest = S % T;

    const fullIncome = full * INCOME_FULL[T];
    const restIncome = INCOME_PARTIAL[Math.min(rest, 5)] || 0;

    const total = fullIncome + restIncome;
    state.money[owner] = (state.money[owner] || 0) + total;
  }

  state.log.push(`Round ${state.round}: income applied`);
}
