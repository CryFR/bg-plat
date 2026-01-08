// server/src/games/dogtown/views.ts
import type { DogtownState } from "./state.js";

export function buildDogtownPublicState(state: DogtownState) {
  const tokensByPlayer: Record<string, Array<{ id: string; kind: string; size: number }>> = {};
  const tokenCounts: Record<string, number> = {};
  for (const pid of state.playerIds) {
    const toks = state.hands.tokens[pid] || [];
    tokenCounts[pid] = toks.length;
    // Tokens are PUBLIC in Dogtown so players can negotiate trades.
    tokensByPlayer[pid] = toks.map((t) => ({ id: t.id, kind: t.kind, size: t.size }));
  }

  const deedsKeepCounts: Record<string, number> = {};
  for (const pid of state.playerIds) deedsKeepCounts[pid] = (state.hands.deedsKeep[pid] || []).length;

  return {
    phase: state.phase,
    round: state.round,
    firstPlayerId: state.playerIds[state.firstPlayerIdx],
    buildDone: state.buildDone,

    owners: state.owners,
    placed: Object.fromEntries(
      Object.entries(state.placed).map(([k, v]) => [
        k,
        v ? { id: v.id, kind: v.kind, size: v.size } : null,
      ])
    ),

    tokenCounts,
    tokensByPlayer,
    deedsKeepCounts,

    // Trade offers are public so players can see & accept them.
    tradeOffers: state.trade.offers.map((o) => ({
      id: o.id,
      from: o.from,
      to: o.to ?? null,
      giveMoney: o.giveMoney,
      takeMoney: o.takeMoney,
      giveTokenIds: [...o.giveTokenIds],
      takeTokenIds: [...o.takeTokenIds],
      createdAt: o.createdAt,
    })),

    tradeSessions: state.trade.sessions.map((s) => ({
      id: s.id,
      a: s.a,
      b: s.b,
      status: s.status,
      createdAt: s.createdAt,
      sideA: { money: s.sideA.money, tokenIds: [...s.sideA.tokenIds], cellIds: [...(s.sideA.cellIds || [])], committed: s.sideA.committed },
      sideB: { money: s.sideB.money, tokenIds: [...s.sideB.tokenIds], cellIds: [...(s.sideB.cellIds || [])], committed: s.sideB.committed },
    })),

    // Reveal final money only when game is finished.
    finalScores:
      state.phase === "end"
        ? state.playerIds.map((pid) => ({ playerId: pid, money: state.money[pid] ?? 0 }))
        : undefined,

    log: state.log.slice(-30),
  };
}

export function buildDogtownSecretState(state: DogtownState, playerId: string) {
  return {
    money: state.money[playerId] ?? 0,
    deeds: state.hands.deeds[playerId] || [],
    deedsKeep: state.hands.deedsKeep[playerId] || [],
    tokens: (state.hands.tokens[playerId] || []).map((t) => ({ id: t.id, kind: t.kind, size: t.size })),
  };
}
