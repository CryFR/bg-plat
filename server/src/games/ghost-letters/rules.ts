import type { Card, Category, GhostLettersState, Role } from "./state.js";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Rounds per official table (final voting does NOT count as a round).
export function roundsForPlayers(n: number) {
  // n >= 4 in our platform
  if (n <= 4) return 6; // 4 -> 5
  if (n <= 7) return 5; // 5-7 -> 4
  if (n <= 10) return 4; // 8-10 -> 3
  return 3; // 11-12 -> 2
}

// --- One finite deck for EVERYTHING (setup + hands) ---
// Unique cards for testing, no repeats in one game.
const MASTER_DECK = [
  "3d-hammer",
  "ample-dress",
  "armchair",
  "bowling-alley",
  "briefcase",
  "butterfly-knife",
  "calculator",
  "cctv-camera",
  "charging",
  "clapperboard",
  "cooking-pot",
  "dog-bowl",
  "dolphin",
  "dream-catcher",
  "drill",
  "dutch-bike",
  "dynamite",
  "easel",
  "eight-ball",
  "emerald-necklace",
  "empty-chessboard",
  "empty-metal-bucket-handle",
  "escalator",
  "eyelashes",
  "falling-bomb",
  "farm-tractor",
  "feline",
  "female-legs",
  "figurehead",
  "film-projector",
  "fire-extinguisher",
  "fire-gem",
  "first-aid-kit",
  "fishing-pole",
  "flashlight",
  "flexible-lamp",
  "flip-flops",
  "foot-plaster",
  "fork-knife-spoon",
  "forklift",
  "french-fries",
  "frog-prince",
  "frozen-body",
  "full-motorcycle-helmet",
  "full-pizza",
  "funnel",
  "fur-boot",
  "furnace",
  "fur-shirt",
  "game-console",
  "gardening-shears",
  "g-clef",
  "glass-celebration",
  "globe-ring",
  "gloves",
  "gold-mine",
  "gps",
  "grass",
  "grass-mushroom",
  "greek-sphinx",
  "guitar-bass-head",
  "half-log",
  "hammer-sickle",
  "hand-bag",
  "hand-bandage",
  "handcuffed",
  "hand-grip",
  "handheld-fan",
  "hand-saw",
  "hanger",
  "hatchet",
  "hemp",
  "highlighter",
  "hill-fort",
  "histogram",
  "hockey",
  "hole-ladder",
  "honey-jar",
  "hoodie",
  "hook",
  "horseshoe",
  "i-beam",
  "ice-pop",
  "id-card",
  "igloo",
  "imperial-crown",
  "injustice",
  "joystick",
  "jug",
  "katana",
  "kebab-spit",
  "keyboard",
  "key-lock",
  "kick-scooter",
  "laptop",
  "large-paint-brush",
  "lasso",
  "leak",
  "level-crossing",
  "life-bar",
  "lighter",
  "lighthouse",
  "lily-pads",
  "lipstick",
  "lockers",
  "lockpicks",
  "log",
  "love-letter",
  "magic-potion",
  "mailbox",
  "marshmallows",
  "matryoshka-dolls",
  "medicine-pills",
  "melting-ice-cube",
  "metal-detector",
  "microphone",
  "mona-lisa",
  "moncler-jacket",
  "money-stack",
  "moon-bats",
  "mouse",
  "muscular-torso",
  "newspaper",
  "notebook",
  "nuclear-waste",
  "office-chair",
  "oil-can",
  "old-lantern",
  "old-microphone",
  "open-folder",
  "paper-plane",
  "papyrus",
  "passport",
  "periscope",
  "person-in-bed",
  "perspective-dice-six-faces-six",
  "pharoah",
  "phone",
  "photo-camera",
  "piggy-bank",
  "pillow",
  "pimiento",
  "pin",
  "pinata",
  "ping-pong-bat",
  "plug",
  "police-car",
  "popcorn",
  "post-stamp",
  "prank-glasses",
  "present",
  "punching-bag",
  "puzzle",
  "rail-road",
  "razor",
  "remedy",
  "ringing-alarm",
  "rolled-cloth",
  "roller-skate",
  "rope-coil",
  "rope-dart",
  "rupee",
  "sarcophagus",
  "satellite-communication",
  "screw",
  "scuba-mask",
  "scuba-tanks",
  "secret-book",
  "sheep",
  "shotgun-rounds",
  "shower",
  "skateboard",
  "skier",
  "sliced-sausage",
  "slot-machine",
  "smartphone",
  "smoking-pipe",
  "smoking-volcano",
  "socks",
  "space-shuttle",
  "sport-medal",
  "stop-sign",
  "strongbox",
  "stun-grenade",
  "swiss-army-knife",
  "tap",
  "throne-king",
  "ticket",
  "time-synchronization",
  "tire-tracks",
  "traffic-cone",
  "trash-can",
  "t-rex-skull",
  "trophies-shelf",
  "unicycle",
  "ushanka",
  "uzi",
  "vending-machine",
  "vr-headset",
  "walkie-talkie",
  "washing-machine",
  "water-diviner-stick",
  "waterfall",
  "weight-scale",
  "whisk",
  "windpump",
  "wind-turbine",
  "wine-bottle",
  "winter-gloves",
  "wool",
];




function rolePlan(count: number): Role[] {
  if (count < 4) throw new Error("Need 4+ players");

  // 4-6: GHOST + KILLER + остальные DETECTIVE
  if (count <= 6) return ["GHOST", "KILLER", ...Array(count - 2).fill("DETECTIVE")];

  // 7-9: добавляем ACCOMPLICE + WITNESS
  if (count <= 9) return ["GHOST", "KILLER", "ACCOMPLICE", "WITNESS", ...Array(count - 4).fill("DETECTIVE")];

  // 10+: два сообщника, свидетель, эксперт
  return ["GHOST", "KILLER", "ACCOMPLICE", "ACCOMPLICE", "WITNESS", "EXPERT", ...Array(count - 6).fill("DETECTIVE")];
}

function hasRole(gs: GhostLettersState, role: Role) {
  return Object.values(gs.roles).some((r) => r === role);
}

function livingVoters(gs: GhostLettersState, allPlayerIds: string[]) {
  // голосуют все, кроме призрака, и кроме арестованных
  return allPlayerIds.filter((pid) => gs.roles[pid] !== "GHOST" && !gs.final?.arrestedIds?.includes(pid));
}

function ensureFinal(gs: GhostLettersState) {
  if (!gs.final) {
    gs.final = {
      votes: { MOTIVE: {}, PLACE: {}, METHOD: {}, KILLER: {} },
      selected: { motiveId: null, placeId: null, methodId: null, killerPlayerId: null },
      arrestedIds: [],
      killerArrestAttempts: 0,
      detectivesWin: null,
      killerWinByGuess: null,
      killerGuess: null,
    };
  }
}

function tallyWinnerChoice(voteMap: Record<string, string>) {
  // voteMap: voterId -> choiceId
  const counts: Record<string, number> = {};
  for (const choice of Object.values(voteMap)) {
    counts[choice] = (counts[choice] ?? 0) + 1;
  }
  let bestId: string | null = null;
  let best = -1;
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      bestId = id;
    }
  }
  return bestId;
}

function newCardId(prefix: string, label: string, i: number) {
  return `${prefix}${Date.now()}-${i}-${label}`;
}

// --- INIT / SETUP DRAFT ---

export function initGhostLetters(playerIds: string[]): GhostLettersState {

  const plan = rolePlan(playerIds.length);
  const shuffledPlayers = shuffle(playerIds);

  const roles: Record<string, Role> = {};
  for (let i = 0; i < shuffledPlayers.length; i++) roles[shuffledPlayers[i]] = plan[i];

  const deck: Card[] = shuffle(MASTER_DECK).map((assetId, i) => ({
    id: newCardId("D", assetId, i),
    label: assetId.replace(/-/g, " "), // временно, чтобы текст был читабельный
    assetId, // 🔑 КЛЮЧЕВОЕ
  }));


  const turnOrder = [...shuffledPlayers];
  const currentTurnPlayerId = turnOrder[0];

  const gs: GhostLettersState = {
    phase: "SETUP_DRAFT",
    roles,

    setup: {
      deck,
      board: { MOTIVE: [], PLACE: [], METHOD: [] },
      currentTurnPlayerId,
      turnOrder,
      draftCardByPlayerId: Object.fromEntries(turnOrder.map((pid) => [pid, null])),
    },

    table: { motive: [], place: [], method: [] },

    // legacy (не используем, но пусть будет)
    trueClues: { motiveId: "", placeId: "", methodId: "" },

    caseFile: null,

    round: 1,
    maxRounds: roundsForPlayers(playerIds.length),
    hands: {},
    mailbox: {},
    roundHints: [],
    revealedHints: [],

    discard: [],
    vanished: [],
    discardedThisRound: {},

    // public reactions (emoji) per evidence card
    reactions: {},

    voteHistory: [],
  };

  dealNextDraftCard(gs, currentTurnPlayerId);
  return gs;
}

function isCategoryFull(gs: GhostLettersState, cat: Category) {
  return gs.setup.board[cat].length >= 4;
}

function allFull(gs: GhostLettersState) {
  return gs.setup.board.MOTIVE.length === 4 && gs.setup.board.PLACE.length === 4 && gs.setup.board.METHOD.length === 4;
}

function nextTurn(gs: GhostLettersState) {
  const order = gs.setup.turnOrder;
  const idx = order.indexOf(gs.setup.currentTurnPlayerId);
  gs.setup.currentTurnPlayerId = order[(idx + 1) % order.length];
  dealNextDraftCard(gs, gs.setup.currentTurnPlayerId);
}

export function dealNextDraftCard(gs: GhostLettersState, playerId: string) {
  if (gs.setup.draftCardByPlayerId[playerId]) return;
  const card = gs.setup.deck.shift() ?? null;
  gs.setup.draftCardByPlayerId[playerId] = card;
}

export function placeDraftCard(gs: GhostLettersState, playerId: string, cat: Category) {
  if (gs.phase !== "SETUP_DRAFT") return { ok: false, error: "BAD_PHASE" as const };
  if (gs.setup.currentTurnPlayerId !== playerId) return { ok: false, error: "NOT_YOUR_TURN" as const };
  if (isCategoryFull(gs, cat)) return { ok: false, error: "CATEGORY_FULL" as const };

  const card = gs.setup.draftCardByPlayerId[playerId];
  if (!card) return { ok: false, error: "NO_DRAFT_CARD" as const };

  gs.setup.board[cat].push(card);
  gs.setup.draftCardByPlayerId[playerId] = null;

  if (allFull(gs)) {
    gs.table.motive = gs.setup.board.MOTIVE;
    gs.table.place = gs.setup.board.PLACE;
    gs.table.method = gs.setup.board.METHOD;

    gs.phase = "KILLER_PICK_CASE";
    return { ok: true, completed: true as const };
  }

  nextTurn(gs);
  return { ok: true, completed: false as const };
}

// --- KILLER PICK CASE ---

export function pickCaseByKiller(
  gs: GhostLettersState,
  picked: { motiveId: string; placeId: string; methodId: string }
) {
  if (gs.phase !== "KILLER_PICK_CASE") return { ok: false, error: "BAD_PHASE" as const };

  const motiveOk = gs.table.motive.some((c) => c.id === picked.motiveId);
  const placeOk = gs.table.place.some((c) => c.id === picked.placeId);
  const methodOk = gs.table.method.some((c) => c.id === picked.methodId);

  if (!motiveOk || !placeOk || !methodOk) return { ok: false, error: "INVALID_PICK" as const };

  gs.caseFile = picked;

  // старт основной игры
  gs.phase = "ROUND_GHOST_PICK";
  //gs.round = 1;
  gs.mailbox = {};
  gs.roundHints = [];
  gs.discardedThisRound = {};

  // первая зацепка: призрак может (по желанию) выложить 1 карту из руки

  return { ok: true as const };

}

// --- HANDS: always 5, max discard/send per round = 1 ---

export function ensureHandsToFive(gs: GhostLettersState, playerIds: string[]) {
  for (const pid of playerIds) {
    const hand = gs.hands[pid] ?? [];
    while (hand.length < 5) {
      const c = gs.setup.deck.shift(); // единая конечная колода
      if (!c) break;
      hand.push(c);
    }
    gs.hands[pid] = hand;
  }
}


export function submitLetter(gs: GhostLettersState, playerId: string, cardId: string) {
  if (gs.phase !== "ROUND_SEND") return false;

  // уже отправлял в этом раунде?
  if (gs.mailbox[playerId]) return false;

  const hand = gs.hands[playerId] ?? [];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return false;

  const [card] = hand.splice(idx, 1);
  gs.hands[playerId] = hand;
  gs.mailbox[playerId] = card;
  return true;
}

export function discardOne(gs: GhostLettersState, playerId: string, cardId: string) {
  // по правилу: сброс только в начале раунда
  if (gs.phase !== "ROUND_SEND") return { ok: false, error: "BAD_PHASE" as const };

  // призрак не может сбрасывать
  if (gs.roles[playerId] === "GHOST") return { ok: false, error: "GHOST_CANT_DISCARD" as const };

  gs.discardedThisRound = gs.discardedThisRound ?? {};
  if (gs.discardedThisRound[playerId]) return { ok: false, error: "ALREADY_DISCARDED" as const };

  const hand = gs.hands[playerId] ?? [];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false, error: "NO_CARD" as const };

  const [card] = hand.splice(idx, 1);
  gs.hands[playerId] = hand;

  gs.discard = gs.discard ?? [];
  gs.discard.push(card);

  gs.discardedThisRound[playerId] = true;

  return { ok: true as const };
}



export function allLettersSent(gs: GhostLettersState, playerIds: string[]) {
  for (const pid of playerIds) {
    if (gs.roles[pid] === "GHOST") continue;
    if (!gs.mailbox[pid]) return false;
  }
  return true;
}

// --- GHOST PICK: hints stay forever ---

export function ghostPick(
  gs: GhostLettersState,
  pickedIds: string[],
  extraFromHandId?: string | null
) {
  if (gs.phase !== "ROUND_GHOST_PICK") return;

  const sent = Object.values(gs.mailbox ?? {});
  const pickedFromMailbox = sent.filter((c) => pickedIds.includes(c.id));
  const picked: Card[] = [...pickedFromMailbox];

  // опционально +1 карта из руки призрака
  if (extraFromHandId) {
    const ghostId = Object.keys(gs.roles).find((pid) => gs.roles[pid] === "GHOST");
    if (ghostId) {
      const hand = gs.hands[ghostId] ?? [];
      const idx = hand.findIndex((c) => c.id === extraFromHandId);
      if (idx >= 0) {
        const [card] = hand.splice(idx, 1);
        gs.hands[ghostId] = hand;
        picked.push(card);
      }
    }
  }

  gs.roundHints = picked;

  // подсказки остаются на поле навсегда
  const existing = new Set(gs.revealedHints.map((c) => c.id));
  for (const c of picked) {
    if (!existing.has(c.id)) gs.revealedHints.push(c);
  }

  // все НЕ выбранные письма уходят в "исчезнувшее"
  const pickedSet = new Set(pickedFromMailbox.map((c) => c.id));
  gs.vanished = gs.vanished ?? [];
  for (const c of sent) {
    if (!pickedSet.has(c.id)) gs.vanished.push(c);
  }

  // очистка почты
  gs.mailbox = {};

  gs.phase = "ROUND_DISCUSS";
}

// --- NEXT: rounds -> final voting ---

export function next(gs: GhostLettersState) {
  // после обсуждения либо новый раунд, либо финал
  const max = gs.maxRounds ?? 4;
  if (gs.round >= max) {
    gs.phase = "FINAL_VOTE"; // legacy marker, сервер вызовет startFinalVoting(gs)
    return;
  }

  gs.round += 1;
  gs.phase = "ROUND_SEND";

  gs.mailbox = {};
  gs.roundHints = [];
  gs.discardedThisRound = {}; // ✅ сброс лимита сброса на новый раунд
  // revealedHints НЕ очищаем
}

// --- FINAL VOTING STATE MACHINE ---

export function startFinalVoting(gs: GhostLettersState) {
  ensureFinal(gs);

  gs.phase = "FINAL_VOTE_MOTIVE";

  // очистить голоса/выборы финала
  gs.final!.votes = { MOTIVE: {}, PLACE: {}, METHOD: {}, KILLER: {} };
  gs.final!.selected = { motiveId: null, placeId: null, methodId: null, killerPlayerId: null };
  gs.final!.arrestedIds = gs.final!.arrestedIds ?? [];
  gs.final!.killerArrestAttempts = gs.final!.killerArrestAttempts ?? 0;

  gs.final!.detectivesWin = null;
  gs.final!.killerWinByGuess = null;
  gs.final!.killerGuess = null;

  // reset audit history for this final sequence
  gs.voteHistory = [];
}

export function castVote(
  gs: GhostLettersState,
  voterId: string,
  kind: "MOTIVE" | "PLACE" | "METHOD" | "KILLER",
  choiceId: string
) {
  ensureFinal(gs);

  // нельзя призраку
  if (gs.roles[voterId] === "GHOST") return { ok: false, error: "GHOST_CANT_VOTE" as const };

  // арестованный не голосует
  if (gs.final!.arrestedIds.includes(voterId)) return { ok: false, error: "ARRESTED_CANT_VOTE" as const };

  // kind должен соответствовать фазе
  const phase = gs.phase;
  const expectedKind =
    phase === "FINAL_VOTE_MOTIVE"
      ? "MOTIVE"
      : phase === "FINAL_VOTE_PLACE"
        ? "PLACE"
        : phase === "FINAL_VOTE_METHOD"
          ? "METHOD"
          : phase === "FINAL_VOTE_KILLER"
            ? "KILLER"
            : null;

  if (!expectedKind) return { ok: false, error: "BAD_PHASE" as const };
  if (expectedKind !== kind) return { ok: false, error: "BAD_KIND" as const };

  // validate choice
  if (kind === "MOTIVE") {
    if (!gs.table.motive.some((c) => c.id === choiceId)) return { ok: false, error: "INVALID_CHOICE" as const };
  }
  if (kind === "PLACE") {
    if (!gs.table.place.some((c) => c.id === choiceId)) return { ok: false, error: "INVALID_CHOICE" as const };
  }
  if (kind === "METHOD") {
    if (!gs.table.method.some((c) => c.id === choiceId)) return { ok: false, error: "INVALID_CHOICE" as const };
  }
  if (kind === "KILLER") {
    // choiceId is playerId
    if (!gs.roles[choiceId]) return { ok: false, error: "INVALID_PLAYER" as const };
    // призрака можно “арестовать”? по правилам обычно нет смысла — запретим
    if (gs.roles[choiceId] === "GHOST") return { ok: false, error: "CANT_ARREST_GHOST" as const };
    // нельзя арестовать уже арестованного
    if (gs.final!.arrestedIds.includes(choiceId)) return { ok: false, error: "ALREADY_ARRESTED" as const };
  }

  gs.final!.votes[kind][voterId] = choiceId;
  return { ok: true as const };
}

export function resolveVoteIfComplete(gs: GhostLettersState, allPlayerIds: string[]) {
  ensureFinal(gs);

  const phase = gs.phase;
  const voters = livingVoters(gs, allPlayerIds);

  const checkDone = (kind: "MOTIVE" | "PLACE" | "METHOD" | "KILLER") => {
    const map = gs.final!.votes[kind];
    return voters.every((pid) => !!map[pid]);
  };

  if (phase === "FINAL_VOTE_MOTIVE") {
    if (!checkDone("MOTIVE")) return;
    const winner = tallyWinnerChoice(gs.final!.votes.MOTIVE);
    gs.final!.selected.motiveId = winner;
    gs.phase = "FINAL_VOTE_PLACE";
    return;
  }

  if (phase === "FINAL_VOTE_PLACE") {
    if (!checkDone("PLACE")) return;
    const winner = tallyWinnerChoice(gs.final!.votes.PLACE);
    gs.final!.selected.placeId = winner;
    gs.phase = "FINAL_VOTE_METHOD";
    return;
  }

  if (phase === "FINAL_VOTE_METHOD") {
    if (!checkDone("METHOD")) return;
    const winner = tallyWinnerChoice(gs.final!.votes.METHOD);
    gs.final!.selected.methodId = winner;
    gs.phase = "FINAL_VOTE_KILLER";
    setEligibleArrest(gs, allPlayerIds);
    return;
  }

  if (phase === "FINAL_VOTE_KILLER") {
    if (!checkDone("KILLER")) return;

    const arrested = tallyWinnerChoice(gs.final!.votes.KILLER);
    gs.final!.selected.killerPlayerId = arrested;

    if (!arrested) {
      // теоретически не должно быть
      finishResult(gs, { detectivesWin: false, reason: "NO_ARREST" });
      return;
    }

    // арест
    gs.final!.arrestedIds.push(arrested);
    gs.final!.killerArrestAttempts += 1;

    const arrestedRole = gs.roles[arrested];

    // если арестовали сообщника — дополнительный арест
    if (arrestedRole === "ACCOMPLICE") {
      // очистить только голоса за арест и повторить фазу
      gs.final!.votes.KILLER = {};
      gs.phase = "FINAL_VOTE_KILLER";
      setEligibleArrest(gs, allPlayerIds);
      return;
    }

    // теперь вычисляем детективскую победу
    const caseFile = gs.caseFile;
    if (!caseFile) {
      finishResult(gs, { detectivesWin: false, reason: "NO_CASEFILE" });
      return;
    }

    const picked = gs.final!.selected;

    const correctClues =
      (picked.motiveId && picked.motiveId === caseFile.motiveId ? 1 : 0) +
      (picked.placeId && picked.placeId === caseFile.placeId ? 1 : 0) +
      (picked.methodId && picked.methodId === caseFile.methodId ? 1 : 0);

    const killerArrested = arrestedRole === "KILLER";

    // "Case revealed" = all three clues are correct.
    const caseRevealed = correctClues === 3;

    const detectivesWin = caseRevealed || (correctClues >= 2 && killerArrested);

    // если детективы НЕ выигрывают — сразу результат
    if (!detectivesWin) {
      finishResult(gs, {
        detectivesWin: false,
        reason: "NOT_ENOUGH",
        correctClues,
        killerArrested,
        arrestedPlayerId: arrested,
      });
      return;
    }

    // If the case is revealed AND there is Witness or Expert in the game,
    // the killer always gets ONE last guess (even if the killer was arrested).
    if (caseRevealed && (hasRole(gs, "WITNESS") || hasRole(gs, "EXPERT"))) {
      gs.final!.detectivesWin = true;
      gs.final!.killerWinByGuess = null;
      gs.phase = "KILLER_GUESS_SPECIAL";
      return;
    }

    // без witness/expert — фиксируем победу
    finishResult(gs, {
      detectivesWin: true,
      reason: "DETECTIVES_WIN",
      correctClues,
      killerArrested,
      arrestedPlayerId: arrested,
    });
  }
}

// Хелпер на Result
function setEligibleArrest(gs: GhostLettersState, allPlayerIds: string[]) {
  ensureFinal(gs);
  const eligible = allPlayerIds.filter(
    (pid) => gs.roles[pid] !== "GHOST" && !gs.final!.arrestedIds.includes(pid)
  );
  gs.public = gs.public ?? {};
  gs.public.eligibleArrestPlayerIds = eligible;
}


function finishResult(gs: GhostLettersState, meta: any) {
  ensureFinal(gs);

  const killerPlayerId =
    Object.keys(gs.roles).find((pid) => gs.roles[pid] === "KILLER") ?? null;

  const payload = {
    ...meta,
    killerPlayerId,
    picked: gs.final!.selected,
    caseFile: gs.caseFile,
    arrestedIds: gs.final!.arrestedIds,
    rolesRevealedForArrested: gs.final!.arrestedIds.map((pid) => ({
      playerId: pid,
      role: gs.roles[pid],
    })),
  };

  gs.final!.result = payload;

  // ✅ чтобы UI не был пустой даже если он смотрит gs.result
  gs.result = payload;

  gs.phase = "RESULT";
}

// --- KILLER GUESS SPECIAL ---

export function killerGuessSpecial(
  gs: GhostLettersState,
  killerId: string,
  targetPlayerId: string,
  roleGuess: "WITNESS" | "EXPERT"
) {
  ensureFinal(gs);

  if (gs.phase !== "KILLER_GUESS_SPECIAL") return { ok: false, error: "BAD_PHASE" as const };

  // только киллер
  if (gs.roles[killerId] !== "KILLER") return { ok: false, error: "ONLY_KILLER" as const };

  // only one attempt
  if (gs.final!.killerGuess) return { ok: false, error: "ALREADY_GUESSED" as const };

  // нельзя угадывать призрака (и себя)
  if (!gs.roles[targetPlayerId]) return { ok: false, error: "INVALID_PLAYER" as const };
  if (targetPlayerId === killerId) return { ok: false, error: "CANT_GUESS_SELF" as const };
  if (gs.roles[targetPlayerId] === "GHOST") return { ok: false, error: "CANT_GUESS_GHOST" as const };

  const real = gs.roles[targetPlayerId];

  const success = real === roleGuess;

  gs.final!.killerGuess = { targetPlayerId, roleGuess, success };

  if (success) {
    gs.final!.killerWinByGuess = true;
    gs.final!.detectivesWin = false;

    finishResult(gs, {
      detectivesWin: false,
      killerWinByGuess: true,
      reason: "KILLER_GUESSED_SPECIAL",
      guessed: { targetPlayerId, roleGuess },
    });
    return { ok: true as const, success: true as const };
  }

  // не угадал — детективы побеждают (они уже прошли условие)
  finishResult(gs, {
    detectivesWin: true,
    killerWinByGuess: false,
    reason: "KILLER_FAILED_GUESS",
    guessed: { targetPlayerId, roleGuess },
  });

  return { ok: true as const, success: false as const };
}

// --- FINALIZE legacy (если где-то используется старый эвент) ---
// Оставим совместимость: сравнить ровно 3 улики (как “дело раскрыто”)
export function finalize(gs: GhostLettersState, picked: { motiveId: string; placeId: string; methodId: string }) {
  const caseFile = gs.caseFile;
  const win =
    !!caseFile &&
    picked.motiveId === caseFile.motiveId &&
    picked.placeId === caseFile.placeId &&
    picked.methodId === caseFile.methodId;

  gs.finalPick = picked;
  gs.result = { detectivesWin: win, picked };
  gs.phase = "RESULT";
}
