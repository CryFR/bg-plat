// server/src/games/ghost-letters/views.ts
import type { GhostLettersState, Role } from "./state.js";

function roleOf(gs: GhostLettersState, playerId: string): Role | null {
  return gs.roles[playerId] ?? null;
}

function canSeeCase(role: Role | null) {
  return role === "GHOST" || role === "KILLER" || role === "ACCOMPLICE";
}

/** Public state (no hands/mailbox/deck/caseFile). */
export function buildPublicState(gs: GhostLettersState) {
  return {
    phase: gs.phase,
    round: gs.round,

    setup: {
      board: gs.setup.board,
      currentTurnPlayerId: gs.setup.currentTurnPlayerId,
      turnOrder: gs.setup.turnOrder,
    },

    table: gs.table,
    revealedHints: gs.revealedHints,

    public: gs.public ?? {},

    final: gs.final
      ? {
          selected: gs.final.selected,
          arrestedIds: gs.final.arrestedIds,
          result: gs.final.result ?? null,
        }
      : null,

    result: (gs as any).result ?? null,
  };
}

/** Secret payload for one player. */
export function buildSecretState(gs: GhostLettersState, playerId: string) {
  const role = roleOf(gs, playerId);

  const secret: any = {
    role,
    hand: gs.hands[playerId] ?? [],
  };

  if (gs.phase === "SETUP_DRAFT") {
    secret.draftCard = gs.setup.draftCardByPlayerId[playerId] ?? null;
  }

  if (role && canSeeCase(role)) {
    secret.caseFile = gs.caseFile;
  }

  return secret;
}

/** Ghost-only mailbox payload (sent on demand). */
export function buildMailboxPayload(gs: GhostLettersState) {
  return { cards: Object.values(gs.mailbox ?? {}) };
}

export function setEligibleArrestPublic(gs: GhostLettersState, allPlayerIds: string[]) {
  if (!gs.final) return;

  const eligible = allPlayerIds.filter(
    (pid) => gs.roles[pid] !== "GHOST" && !gs.final!.arrestedIds.includes(pid)
  );

  gs.public = gs.public ?? {};
  gs.public.eligibleArrestPlayerIds = eligible;
}
