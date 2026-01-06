// server/src/games/ghost-letters/views.ts
import type { GhostLettersState, Role } from "./state.js";

function roleOf(gs: GhostLettersState, playerId: string): Role | null {
  return gs.roles[playerId] ?? null;
}

function idsByRole(gs: GhostLettersState, role: Role) {
  return Object.entries(gs.roles)
    .filter(([, r]) => r === role)
    .map(([pid]) => pid);
}

function firstIdByRole(gs: GhostLettersState, role: Role) {
  return idsByRole(gs, role)[0] ?? null;
}

function canSeeFullCase(role: Role | null) {
  // По правилам со скрина:
  // - Ghost видит дело
  // - Killer видит дело
  // - Accomplice видит дело
  return role === "GHOST" || role === "KILLER" || role === "ACCOMPLICE";
}

/** Public state (no hands/mailbox/deck/caseFile). */
export function buildPublicState(gs: GhostLettersState) {
  if (gs.phase === "WAITING_FOR_PLAYERS") {
    return {
      phase: gs.phase,
      round: gs.round,
      public: gs.public ?? {},
      waiting: (gs.public as any)?.waiting ?? null,
      reactions: gs.reactions ?? {},
      voteHistory: gs.voteHistory ?? [],
    };
  }

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

    reactions: gs.reactions ?? {},

    public: gs.public ?? {},

    final: gs.final
      ? {
          votes: gs.final.votes,
          selected: gs.final.selected,
          arrestedIds: gs.final.arrestedIds,
          result: gs.final.result ?? null,
        }
      : null,

    voteHistory: gs.voteHistory ?? [],

    result: (gs as any).result ?? null,
  };
}

/** Secret payload for one player. */
export function buildSecretState(gs: GhostLettersState, playerId: string) {
  const role = roleOf(gs, playerId);

  const secret: any = {
    role,
    spectator: role == null,
    hand: role ? gs.hands[playerId] ?? [] : [],
  };

  if (gs.phase === "SETUP_DRAFT") {
    secret.draftCard = gs.setup.draftCardByPlayerId[playerId] ?? null;
  }

  const killerId = firstIdByRole(gs, "KILLER");
  const accompliceIds = idsByRole(gs, "ACCOMPLICE");
  const witnessId = firstIdByRole(gs, "WITNESS");
  const expertId = firstIdByRole(gs, "EXPERT");

  // Знание убийцы:
  // Witness видит ТОЛЬКО убийцу
  if (role === "WITNESS") {
    secret.killerId = killerId;
  }

  // Сообщник видит правильное дело и убийцу
  if (role === "ACCOMPLICE") {
    secret.killerId = killerId;
    secret.caseFile = gs.caseFile;
  }

  // Убийца видит дело + ник(и) сообщника(ов)
  if (role === "KILLER") {
    secret.accompliceIds = accompliceIds;
    secret.caseFile = gs.caseFile;
  }

  // Эксперт видит только правильные улики (без убийцы/сообщника/свидетеля)
  if (role === "EXPERT") {
    secret.correctClues = gs.caseFile; // { motiveId, placeId, methodId }
  }

  // Призрак видит всё: убийцу, сообщников, свидетеля, эксперта + дело
  if (role === "GHOST") {
    secret.killerId = killerId;
    secret.accompliceIds = accompliceIds;
    secret.witnessId = witnessId;
    secret.expertId = expertId;
    secret.caseFile = gs.caseFile;
  }

  // На всякий: если кто-то ещё должен видеть полное дело
  if (role && canSeeFullCase(role) && !secret.caseFile) {
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
