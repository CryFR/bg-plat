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
const BUILDINGS: Array<{ kind: string; size: BuildingTypeSize }> = [
  { kind: "icecream", size: 3 },
  { kind: "wheezes", size: 3 },
  { kind: "prophet", size: 3 },

  { kind: "cauldron", size: 4 },
  { kind: "robes", size: 4 },
  { kind: "slugjigger", size: 4 },

  { kind: "owl", size: 5 },
  { kind: "books", size: 5 },
  { kind: "bank", size: 5 },

  { kind: "menagerie", size: 6 },
  { kind: "ollivander", size: 6 },
  { kind: "quidditch", size: 6 },
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
}

export function endTrade(state: DogtownState) {
  if (state.phase !== "trade") return { ok: false, error: "WRONG_PHASE" } as const;
  state.phase = "build";
  // Build is simultaneous: everyone can place on their own lots until they mark done.
  for (const pid of state.playerIds) state.buildDone[pid] = false;
  state.log.push(`Round ${state.round}: build phase start`);
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
