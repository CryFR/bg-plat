// server/src/games/ghost-letters/state.ts

export type Category = "MOTIVE" | "PLACE" | "METHOD";

export type Role =
  | "GHOST"
  | "KILLER"
  | "ACCOMPLICE"
  | "WITNESS"
  | "EXPERT"
  | "DETECTIVE";

export type Card = {
  id: string;
  label: string;
  assetId: string;
};

export type ReactionEmoji = "✅" | "❌" | "🤔";

/** cardId -> playerId -> emoji */
export type ReactionsByCardId = Record<string, Record<string, ReactionEmoji>>;

export type GhostLettersPhase =
  | "WAITING_FOR_PLAYERS"
  | "SETUP_DRAFT"
  | "KILLER_PICK_CASE"
  | "ROUND_SEND"
  | "ROUND_GHOST_PICK"
  | "ROUND_DISCUSS"
  | "FINAL_VOTE"
  | "FINAL_VOTE_MOTIVE"
  | "FINAL_VOTE_PLACE"
  | "FINAL_VOTE_METHOD"
  | "FINAL_VOTE_KILLER"
  | "KILLER_GUESS_SPECIAL"
  | "RESULT";

export type FinalVoteKind = "MOTIVE" | "PLACE" | "METHOD" | "KILLER";

export type GhostLettersState = {
  phase: GhostLettersPhase;
  round: number;
  /** Number of normal rounds (final voting does NOT count). */
  maxRounds?: number;

  roles: Record<string, Role>;

  setup: {
    deck: Card[];
    board: Record<Category, Card[]>;
    currentTurnPlayerId: string;
    turnOrder: string[];
    draftCardByPlayerId: Record<string, Card | null>;
  };

  table: { motive: Card[]; place: Card[]; method: Card[] };

  caseFile: { motiveId: string; placeId: string; methodId: string } | null;

  hands: Record<string, Card[]>;
  mailbox: Record<string, Card>; // playerId -> sent card

  roundHints: Card[];
  revealedHints: Card[];

  discard: Card[];
  vanished: Card[];

  discardedThisRound: Record<string, boolean>;

  /** Players' public reactions on evidence cards. */
  reactions?: ReactionsByCardId;

  public?: {
    eligibleArrestPlayerIds?: string[];
    /** For lobby / UX. Not used by core rules. */
    waiting?: { minPlayers: number; currentPlayers: number; reason?: string };
  };

  final?: {
    votes: {
      MOTIVE: Record<string, string>;
      PLACE: Record<string, string>;
      METHOD: Record<string, string>;
      KILLER: Record<string, string>;
    };
    selected: {
      motiveId: string | null;
      placeId: string | null;
      methodId: string | null;
      killerPlayerId: string | null;
    };
    arrestedIds: string[];
    killerArrestAttempts: number;
    detectivesWin: boolean | null;
    killerWinByGuess: boolean | null;
    killerGuess: null | { targetPlayerId: string; roleGuess: "WITNESS" | "EXPERT"; success: boolean };
    result?: any;
  };

  /**
   * Public audit snapshots of final votes (for UI/history).
   * IMPORTANT: stored only when a voting stage is finalized (end of stage), not on every click.
   */
  voteHistory?: Array<{
    round: number;
    phase: "FINAL_VOTE_MOTIVE" | "FINAL_VOTE_PLACE" | "FINAL_VOTE_METHOD" | "FINAL_VOTE_KILLER";
    kind: FinalVoteKind;
    /** voterId -> choiceId */
    votes: Record<string, string>;
    at: number;
  }>;

  // legacy/optional
  trueClues?: { motiveId: string; placeId: string; methodId: string };
  finalPick?: any;
  result?: any;
};
