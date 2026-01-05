// server/src/types.ts

export type RoomCode = string;

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

export type GhostLettersPhase =
  | "SETUP_DRAFT"
  | "KILLER_PICK_CASE"
  | "ROUND_SEND"
  | "ROUND_GHOST_PICK"
  | "ROUND_DISCUSS"
  | "FINAL_VOTE" // legacy marker, used as a bridge before startFinalVoting()
  | "FINAL_VOTE_MOTIVE"
  | "FINAL_VOTE_PLACE"
  | "FINAL_VOTE_METHOD"
  | "FINAL_VOTE_KILLER"
  | "KILLER_GUESS_SPECIAL"
  | "RESULT";

export type CaseFile = {
  motiveId: string;
  placeId: string;
  methodId: string;
};

export type GhostLettersSetupState = {
  deck: Card[];
  board: Record<Category, Card[]>;
  currentTurnPlayerId: string;
  turnOrder: string[];
  draftCardByPlayerId: Record<string, Card | null>;
};

export type FinalVoteKind = "MOTIVE" | "PLACE" | "METHOD" | "KILLER";

export type FinalState = {
  // votes[kind][voterId] = choiceId
  votes: Record<FinalVoteKind, Record<string, string>>;
  selected: {
    motiveId: string | null;
    placeId: string | null;
    methodId: string | null;
    killerPlayerId: string | null;
  };

  // players arrested during FINAL_VOTE_KILLER chain (accomplices -> extra arrests)
  arrestedIds: string[];
  killerArrestAttempts: number;

  // outcome flags (filled near end)
  detectivesWin: boolean | null;
  killerWinByGuess: boolean | null;

  killerGuess: null | {
    targetPlayerId: string;
    roleGuess: "WITNESS" | "EXPERT";
    success: boolean;
  };

  // result payload for UI/debug
  result?: any;
};

export type GhostLettersState = {
  phase: GhostLettersPhase;
  // Arrested Player ID
  public?: {
    eligibleArrestPlayerIds?: string[];
  };

  // role map: playerId -> role
  roles: Record<string, Role>;

  // setup (draft field building)
  setup: GhostLettersSetupState;

  // public board categories used in main game
  table: {
    motive: Card[];
    place: Card[];
    method: Card[];
  };

  // legacy (kept for compatibility, not used by current rules)
  trueClues: CaseFile;

  // killer-selected true clues (secret; only killer+accomplice+ghost see via me:secret)
  caseFile: CaseFile | null;

  // rounds
  round: number;

  // private hands: playerId -> cards (NOT for public snapshot)
  hands: Record<string, Card[]>;

  // per-round submissions: playerId -> card (NOT for public snapshot)
  mailbox: Record<string, Card>;

  // hints selected in current round (optional for UI)
  roundHints: Card[];

  // hints accumulated across all rounds (public)
  revealedHints: Card[];
  discard: [],
  vanished: [],
  discardedThisRound: {},
  // final voting/arrest logic
  final: FinalState | null;

  // legacy result fields (optional)
  finalPick?: CaseFile;
  result?: any;
};

export type Player = {
  playerId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
};

export type RoomGame = {
  id: "ghost-letters";
  state: GhostLettersState;
};

export type Room = {
  code: RoomCode;
  players: Player[];
  game: RoomGame | null;

  // housekeeping
  emptySince: number | null;
  lastActiveAt: number;
};

export type ClientPlayer = {
  playerId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
};

export type ClientRoomSnapshot = {
  code: string;
  players: ClientPlayer[];
  game: null | {
    id: "ghost-letters";
    state: any; // server snapshot strips secrets (hands/mailbox/caseFile)
  };
};

