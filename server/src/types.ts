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
  | "FINAL_VOTE"
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
  round: number;

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
  mailbox: Record<string, Card>;        // playerId -> sent card

  roundHints: Card[];
  revealedHints: Card[];

  discard: Card[];
  vanished: Card[];

  discardedThisRound: Record<string, boolean>; // playerId -> usedDiscardThisRound

  public?: {
    eligibleArrestPlayerIds?: string[];
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

  // если где-то использовалось ранее
  trueClues?: { motiveId: string; placeId: string; methodId: string };
  finalPick?: any;
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

  createdAt: number;

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

