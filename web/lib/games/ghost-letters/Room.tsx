"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../../socket";
import { getPlayerId, getSavedName } from "../../player";

type Card = { id: string; label: string; assetId: string };
type Player = { playerId: string; socketId: string; name: string; color?: string; isHost: boolean; ready: boolean; connected: boolean; spectator?: boolean; };
type Setup = { board: { MOTIVE: Card[]; PLACE: Card[]; METHOD: Card[] }; currentTurnPlayerId: string; turnOrder: string[] };
type CaseFile = { motiveId: string; placeId: string; methodId: string };

type GameState = {
  phase:
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

  round: number;
  setup: Setup;

  table: { motive: Card[]; place: Card[]; method: Card[] };

  revealedHints: Card[];

  // public reactions: cardId -> playerId -> emoji
  reactions?: Record<string, Record<string, "✅" | "❌" | "🤔">>;

  // public final vote history (from server)
  voteHistory?: Array<{
    round: number;
    phase: "FINAL_VOTE_MOTIVE" | "FINAL_VOTE_PLACE" | "FINAL_VOTE_METHOD" | "FINAL_VOTE_KILLER";
    kind: "MOTIVE" | "PLACE" | "METHOD" | "KILLER";
    votes: Record<string, string>; // voterId -> choiceId
    at: number;
  }>;

  // server may store this under gs.public
  public?: {
    eligibleArrestPlayerIds?: string[];
    waiting?: { minPlayers: number; currentPlayers: number; reason?: string };
  };

  result?: any;
  final?: any;
};

type Snapshot = { code: string; players: Player[]; game: null | { id: "ghost-letters"; state: GameState } };

export default function GhostLettersRoom({ code }: { code: string }) {
  const router = useRouter();
  const socket = useMemo(() => getSocket(), []);

  const [snap, setSnap] = useState<Snapshot | null>(null);

  const [discardMode, setDiscardMode] = useState(false);
  const [didDiscardThisRound, setDidDiscardThisRound] = useState(false);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string>("");
  const [rxOpen, setRxOpen] = useState(false);
  const [rxAnchor, setRxAnchor] = useState<DOMRect | null>(null);
  const [rxEmoji, setRxEmoji] = useState<"✅" | "❌" | "🤔">("✅");
  const [rxUsers, setRxUsers] = useState<string[]>([]);

  const voteHistRef = useRef<HTMLDivElement | null>(null);

  function onOpenReactionList(anchor: DOMRect, emoji: "✅" | "❌" | "🤔", users: string[]) {
    setRxAnchor(anchor);
    setRxEmoji(emoji);
    setRxUsers(users);
    setRxOpen(true);
  }


  useEffect(() => {
    // when toggling discard mode, force re-select to avoid accidental action
    setSelectedHandCardId("");
  }, [discardMode]);

  // secrets
  const [role, setRole] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState<boolean>(false);
  const [hand, setHand] = useState<Card[]>([]);
  const [draftCard, setDraftCard] = useState<Card | null>(null);
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [killerId, setKillerId] = useState<string | null>(null);
  const [accompliceIds, setAccompliceIds] = useState<string[]>([]);
  const [witnessId, setWitnessId] = useState<string | null>(null);
  const [expertId, setExpertId] = useState<string | null>(null);
  const [correctClues, setCorrectClues] = useState<CaseFile | null>(null);

  // ghost mailbox
  const [mailbox, setMailbox] = useState<Card[]>([]);
  const [ghostPickIds, setGhostPickIds] = useState<string[]>([]);
  const [ghostExtraId, setGhostExtraId] = useState<string>("");

  // killer pick
  const [killerPick, setKillerPick] = useState<Partial<CaseFile>>({});

  // voting local (highlight only)
  const [myVote, setMyVote] = useState<Record<string, string>>({});

  // killer guess special
  const [guessTarget, setGuessTarget] = useState<string>("");
  const [guessRole, setGuessRole] = useState<"WITNESS" | "EXPERT">("WITNESS");

  useEffect(() => {
    const onUpdate = (s: Snapshot) => setSnap(s);
    const onSecret = (m: any) => {
      setRole(m?.role ?? null);
      setIsSpectator(!!m?.spectator || !m?.role);
      if (Array.isArray(m?.hand)) setHand(m.hand);
      setDraftCard(m?.draftCard ?? null);
      setCaseFile((m?.caseFile ?? m?.pickedCase ?? m?.picked ?? m?.case ?? null) as any);
      setKillerId(m?.killerId ?? null);
      setAccompliceIds(Array.isArray(m?.accompliceIds) ? m.accompliceIds : []);
      setWitnessId(m?.witnessId ?? null);
      setExpertId(m?.expertId ?? null);
      setCorrectClues((m?.correctClues ?? m?.solution ?? m?.finalCase ?? null) as any);
    };
    const onMailbox = (m: any) => Array.isArray(m?.cards) && setMailbox(m.cards);
    const onKicked = () => {
      alert("Тебя кикнули из комнаты");
      window.location.href = "/bg";
    };

    socket.on("room:update", onUpdate);
    socket.on("me:secret", onSecret);
    socket.on("ghost:mailbox", onMailbox);
    socket.on("room:kicked", onKicked);
    socket.on("room:error", (p: any) => {
      // avoid noisy console in production
    });

    socket.emit("room:join", { code, name: getSavedName("Nik"), playerId: getPlayerId() }, (res: any) => {
      if (res?.error) {
        alert("Комната не найдена");
        router.push("/bg");
      } else if (res?.snapshot) setSnap(res.snapshot);
    });

    return () => {
      socket.off("room:update", onUpdate);
      socket.off("me:secret", onSecret);
      socket.off("ghost:mailbox", onMailbox);
      socket.off("room:kicked", onKicked);
      socket.off("room:error");
    };
  }, [socket, code, router]);

  const gs = snap?.game?.state;
  const phase = gs?.phase;

  const round = gs?.round ?? 0;

  useEffect(() => {
    // каждый раз, когда сервер реально входит в ROUND_SEND нового раунда —
    // включаем возможность сброса (локальные флаги должны подчиняться серверу)
    if (phase === "ROUND_SEND") {
      setDidDiscardThisRound(false);
      setDiscardMode(false);
    }
  }, [phase, round]);


  if (phase === "WAITING_FOR_PLAYERS") {
    const w = (gs as any)?.public?.waiting;
    const cur = w?.currentPlayers ?? (snap?.players?.length ?? 1);
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Письма призрака</h1>
        <div style={{ opacity: 0.8, marginBottom: 12 }}>Комната: {code}</div>

        <div style={{ border: "1px solid #2a2a3a", background: "#10101a", padding: 16, borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Ждём игроков</h3>
          <div style={{ opacity: 0.8 }}>
            Для старта нужно <b>4+</b> игроков. Сейчас: <b>{cur}</b>.
          </div>
          {w?.reason ? <div style={{ marginTop: 8, opacity: 0.6, fontSize: 13 }}>{w.reason}</div> : null}
          <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
            Поделись ссылкой комнаты друзьям и когда вас будет 4+ — хост сможет нажать “Старт”.
          </div>
        </div>
      </div>
    );
  }





  const myPid = getPlayerId();
  const myName = snap?.players?.find((p) => p.playerId === myPid)?.name ?? "???";
  const me = snap?.players?.find((p) => p.playerId === myPid);
  const isHost = !!me?.isHost;


  const isKiller = role === "KILLER";
  const isGhost = role === "GHOST";
  const isDiscuss = phase === "ROUND_DISCUSS";

  function restart() {
    if (!confirm("Точно начать новую игру? Текущая партия будет сброшена.")) return;
    socket.emit("game:ghostletters:restart", { code, byPlayerId: myPid }, (res: any) => {
      if (!res?.ok) alert("Не удалось начать новую игру");
      setMyVote({});
      setGhostPickIds([]);
      setMailbox([]);
      setKillerPick({});
      setGuessTarget("");
      setGuessRole("WITNESS");
      setDidDiscardThisRound(false);
      setDiscardMode(false);
    });
  }

  function setupPlace(category: "MOTIVE" | "PLACE" | "METHOD") {
    socket.emit(
      "game:ghostletters:setupPlace",
      { code, playerId: getPlayerId(), category },
      (res: any) => {
        if (!res?.ok) alert(res?.error ?? "Не удалось положить улику");
      }
    );
  }


  function submitKillerCase() {
    if (!killerPick.motiveId || !killerPick.placeId || !killerPick.methodId) return;
    socket.emit("game:ghostletters:killerPickCase", { code, playerId: myPid, picked: killerPick }, (res: any) => {
      if (!res?.ok) alert(res?.error ?? "Не получилось задать дело");
    });
  }

  function send(cardId: string) {
    if (isSpectator) return;
    socket.emit("game:ghostletters:send", { code, playerId: myPid, cardId }, (res: any) => {
      if (!res?.ok) alert("Нельзя отправить (возможно, ты уже отправлял в этом раунде)");
    });
  }

  function toggleGhostPick(id: string) {
    setGhostPickIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitGhostPick() {
    socket.emit(
      "game:ghostletters:ghostPick",
      { code, playerId: myPid, pickedIds: ghostPickIds, extraFromHandId: ghostExtraId || null },
      (res: any) => {
        if (!res?.ok) alert(res?.error ?? "Не получилось выбрать подсказки");
        else {
          setGhostPickIds([]);
          setGhostExtraId("");
          setMailbox([]);
        }
      }
    );
  }

  function nextRound() {
    socket.emit("game:ghostletters:next", { code, byPlayerId: myPid });
    setMailbox([]);
    setGhostPickIds([]);
  }

  function vote(kind: "MOTIVE" | "PLACE" | "METHOD" | "KILLER", choiceId: string) {
    if (isSpectator) return;
    socket.emit("game:ghostletters:vote", { code, playerId: myPid, kind, choiceId }, (res: any) => {
      if (!res?.ok) alert(res?.error ?? "Голос не принят");
      else setMyVote((p) => ({ ...p, [kind]: choiceId }));
    });
  }

  function reactToCard(cardId: string, emoji: "✅" | "❌" | "🤔") {
    // Ghost can view reactions, but must not set them.
    if (isSpectator) return;
    if (role === "GHOST") return;
    socket.emit(
      "game:ghostletters:react",
      { code, playerId: myPid, cardId, emoji },
      () => { }
    );
  }

  const canReact = !isSpectator && role !== "GHOST";
  function renderLiveVotes() {
    const fin = (gs as any).final;
    const votes = fin?.votes;
    if (!votes) return null;

    const phase = gs.phase as string;

    let title = "";
    let items: Array<{ pid: string; value: string }> = [];

    const pushCardVotes = (row: Card[], v: Record<string, string>, label: string) => {
      title = label;
      items = Object.entries(v || {}).map(([pid, cardId]) => ({
        pid,
        value: String(posById(row, cardId) ?? "?"),
      }));
    };

    if (phase === "FINAL_VOTE_MOTIVE") pushCardVotes(gs.table.motive, votes.MOTIVE, "Голоса: Мотив");
    else if (phase === "FINAL_VOTE_PLACE") pushCardVotes(gs.table.place, votes.PLACE, "Голоса: Место");
    else if (phase === "FINAL_VOTE_METHOD") pushCardVotes(gs.table.method, votes.METHOD, "Голоса: Способ");
    else if (phase === "FINAL_VOTE_KILLER") {
      title = "Голоса: Кого в клетку";
      items = Object.entries(votes.KILLER || {}).map(([pid, targetPid]) => ({
        pid,
        value: String(targetPid),
      }));
    } else return null;

    // show in stable order
    items.sort((a, b) => (nameById(snap.players, a.pid) > nameById(snap.players, b.pid) ? 1 : -1));

    return (
      <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #232338", background: "#0d0d16" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
          {items.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Пока никто не проголосовал</div>
          ) : (
            items.map((it) => (
              <div key={it.pid} style={{ display: "contents" }}>
                <div style={{ opacity: 0.9 }}>
                  <PlayerLabel players={snap.players} pid={it.pid} />
                </div>
                <div style={{ fontWeight: 800, opacity: 0.95 }}>
                  {phase === "FINAL_VOTE_KILLER" ? <PlayerLabel players={snap.players} pid={it.value} /> : it.value}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const voteHistory = (gs as any)?.voteHistory as GameState["voteHistory"] | undefined;

  useEffect(() => {
    if (!voteHistory || voteHistory.length === 0) return;
    const el = voteHistRef.current;
    if (!el) return;
    // Chat-like: always scroll to bottom when a new finalized stage appears.
    el.scrollTop = el.scrollHeight;
  }, [voteHistory?.length]);

  function renderVoteHistory() {
    const hist = voteHistory;
    if (!hist || hist.length === 0) return null;

    const phaseLabel = (p: string) => {
      if (p === "FINAL_VOTE_MOTIVE") return "Мотив";
      if (p === "FINAL_VOTE_PLACE") return "Место";
      if (p === "FINAL_VOTE_METHOD") return "Способ";
      if (p === "FINAL_VOTE_KILLER") return "Кого в клетку";
      return p;
    };

    const posInRow = (p: string, cardId: string) => {
      if (p === "FINAL_VOTE_MOTIVE") return posById(gs.table.motive, cardId);
      if (p === "FINAL_VOTE_PLACE") return posById(gs.table.place, cardId);
      if (p === "FINAL_VOTE_METHOD") return posById(gs.table.method, cardId);
      return null;
    };

    const fmtTime = (ms: number) => {
      try {
        return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } catch {
        return "";
      }
    };

    return (
      <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #232338", background: "#0d0d16" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>История голосования</div>

        <div
          ref={voteHistRef}
          style={{
            maxHeight: 260,
            overflowY: "auto",
            paddingRight: 6,
            display: "grid",
            gap: 10,
          }}
        >
          {hist.map((h, idx) => {
            const label = phaseLabel(h.phase);
            const entries = Object.entries(h.votes ?? {});

            // Show only finalized results (no placeholders). If somehow empty, skip.
            if (entries.length === 0) return null;

            return (
              <div
                key={`${h.at}-${idx}`}
                style={{
                  border: "1px solid #1e1e2c",
                  background: "#0b0b14",
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800 }}>
                    Раунд {h.round} · {label}
                  </div>
                  <div style={{ opacity: 0.65, fontSize: 12 }}>{fmtTime(h.at)}</div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  {entries.map(([pid, choice]) => {
                    const who = nameById(snap.players, pid);
                    let val: string;
                    if (h.kind === "KILLER") {
                      val = nameById(snap.players, choice);
                    } else {
                      val = String(posInRow(h.phase, choice) ?? "?");
                    }
                    return (
                      <div key={pid} style={{ display: "contents" }}>
                        <div style={{ opacity: 0.9 }}>{who}</div>
                        <div style={{ fontWeight: 800, opacity: 0.95 }}>{val}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }


  function discard(cardId: string) {
    if (isSpectator) return;
    socket.emit("game:ghostletters:discard", { code, playerId: myPid, cardId }, (res: any) => {
      if (res?.ok) {
        setDidDiscardThisRound(true);
        setDiscardMode(false);
        setSelectedHandCardId("");
        return;
      }
      // без алертов — просто выключаем режим
      setDiscardMode(false);
    });
  }


  function killerGuess() {
    if (!guessTarget) return;
    socket.emit(
      "game:ghostletters:killerGuessSpecial",
      { code, playerId: myPid, targetPlayerId: guessTarget, roleGuess: guessRole },
      (res: any) => {
        if (!res?.ok) alert(res?.error ?? "Не удалось сделать предположение");
      });
  }


  if (!snap?.game || !gs) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Письма призрака</h1>
        <p style={{ opacity: 0.8 }}>Игра ещё не началась. Вернись в лобби.</p>
        <button onClick={() => router.push(`/room/${code}`)} style={btnStyle(false)}>
          В лобби
        </button>
      </div>
    );
  }

  const board = gs.setup.board;
  const isMyDraftTurn = phase === "SETUP_DRAFT" && gs.setup.currentTurnPlayerId === myPid;

  // During SETUP_DRAFT the server gradually fills setup.board; show it directly in the main clue field.
  const fieldMotive = phase === "SETUP_DRAFT" ? board.MOTIVE : gs.table.motive;
  const fieldPlace = phase === "SETUP_DRAFT" ? board.PLACE : gs.table.place;
  const fieldMethod = phase === "SETUP_DRAFT" ? board.METHOD : gs.table.method;

  const tableReady = (fieldMotive?.length ?? 0) > 0 || (fieldPlace?.length ?? 0) > 0 || (fieldMethod?.length ?? 0) > 0;

  // result payload may be in gs.result or gs.final.result
  const resultPayload = gs.result ?? gs.final?.result ?? null;

  const eligibleArrestIds: string[] =
    gs.public?.eligibleArrestPlayerIds?.length
      ? gs.public.eligibleArrestPlayerIds
      : snap.players.map((p) => p.playerId);

  return (
    <div style={{ width: "100%", height: "100%", padding: 10, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1920, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Ghost Letters</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Комната: <b>{code}</b> • Статус: <b>{phase ?? "?"}</b> • Раунд: <b>{gs.round}</b> • Ты: <span style={{ display: "inline-flex", alignItems: "center"}}><ColorDot color={colorById(snap.players, myPid)} /><b>{myName}</b></span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => (window.location.href = `/bg`)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Назад
            </button>

            {isHost ? (
              <>
                <button
                  onClick={restart}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "#ef4444",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Restart
                </button>

                <button
                  onClick={nextRound}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: isDiscuss ? "#16a34a" : "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    boxShadow: isDiscuss ? "0 0 0 2px rgba(34,197,94,0.35), 0 12px 28px rgba(34,197,94,0.18)" : "none",
                  }}
                  title="Перейти к следующему этапу (хост)"
                >
                  Next
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Restart только у хоста
              </div>
            )}

          </div>
        </div>

        {/* Players chips */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {(snap.players || []).map((p) => (
            <span
              key={p.playerId}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                opacity: p.connected ? 1 : 0.55,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
                fontSize: 13,
              }}
              title={p.connected ? "online" : "offline"}
            >
              <span style={{ display: "inline-flex", alignItems: "center", transform: "translateY(1px)" }}><ColorDot color={p.color} />{p.name}</span>{p.isHost ? "👑" : ""}
            </span>
          ))}
        </div>

        {phase === "RESULT" ? (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.35)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000, fontSize: 18 }}>
                {resultPayload?.detectivesWin ? "✅ Детективы победили" : "❌ Победа убийцы"}
              </div>
              {isHost ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>Можно нажать Restart для новой партии.</div>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.8 }}>Ждём, пока хост начнёт новую партию.</div>
              )}
            </div>

            {resultPayload ? (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  Причина: <b>{String(resultPayload.reason ?? "—")}</b>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Истинное дело</div>
                    <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.35 }}>
                      <div><b>Мотив:</b> {posById(gs.table.motive, resultPayload.caseFile?.motiveId) ?? "?"}</div>
                      <div><b>Место:</b> {posById(gs.table.place, resultPayload.caseFile?.placeId) ?? "?"}</div>
                      <div><b>Способ:</b> {posById(gs.table.method, resultPayload.caseFile?.methodId) ?? "?"}</div>
                    </div>
                  </div>

                  <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Убийца</div>
                    <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.35 }}>
                      <div><b>{resultPayload.killerPlayerId ? <PlayerLabel players={snap.players} pid={resultPayload.killerPlayerId} /> : "—"}</b></div>
                      <div style={{ marginTop: 6, opacity: 0.85 }}>
                        {resultPayload.killerWinByGuess ? "Победа по угадыванию роли" : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Арестованные</div>
                    <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.35 }}>
                      {(resultPayload.rolesRevealedForArrested || []).length ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          {resultPayload.rolesRevealedForArrested.map((x: any) => (
                            <div key={x.playerId}>
                              <PlayerLabel players={snap.players} pid={x.playerId} /> — <b>{String(x.role)}</b>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ opacity: 0.75 }}>—</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                Результат пока не пришёл с сервера…
              </div>
            )}
          </div>
        ) : null}

        {/* 3-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "420px minmax(720px, 1fr) 420px", gap: 16, alignItems: "start" }}>
          {/* LEFT: hand + logs */}
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Рука игрока</div>

              {isSpectator ? (
                <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.35 }}>
                  <b>Вы зритель.</b> Вы зашли после старта партии, поэтому роли/рука могут быть недоступны.
                </div>
              ) : null}

              {/* ROUND_SEND: send/discard */}
              {phase === "ROUND_SEND" ? (
                isGhost ? (
                  <div style={{ fontSize: 13, opacity: 0.8 }}>Вы Призрак — ждите письма.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                      За раунд можно отправить <b>1</b> письмо. Опционально: сбросить <b>1</b> карту в начале раунда.
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {hand.map((c) => (
                        <CardBtn
                          key={c.id}
                          card={c}
                          mode={discardMode ? "discard" : "normal"}
                          selected={selectedHandCardId === c.id}
                          onClick={() => setSelectedHandCardId((prev) => (prev === c.id ? "" : c.id))}
                        />
                      ))}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        disabled={isSpectator || discardMode || !selectedHandCardId}
                        onClick={() => {
                          if (isSpectator) return;
                          if (!selectedHandCardId) return;
                          send(selectedHandCardId);
                          setSelectedHandCardId("");
                        }}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: !discardMode && selectedHandCardId ? "#16a34a" : "rgba(255,255,255,0.06)",
                          color: "#fff",
                          cursor: !discardMode && selectedHandCardId ? "pointer" : "not-allowed",
                          opacity: !discardMode && selectedHandCardId ? 1 : 0.6,
                          fontWeight: 900,
                        }}
                      >
                        Отправить
                      </button>

                      {!didDiscardThisRound ? (
                        <>
                          <button
                            disabled={isSpectator}
                            onClick={() => {
                              if (isSpectator) return;
                              if (!discardMode) {
                                setDiscardMode(true);
                                return;
                              }
                              if (!selectedHandCardId) return;
                              discard(selectedHandCardId);
                              setSelectedHandCardId("");
                            }}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(239,68,68,0.25)",
                              color: "#fff",
                              cursor: isSpectator ? "not-allowed" : "pointer",
                              opacity: isSpectator ? 0.6 : 1,
                              fontWeight: 900,
                            }}
                          >
                            {discardMode ? "Сбросить" : "Сброс (1)"}
                          </button>

                          {discardMode ? (
                            <button
                              onClick={() => {
                                setDiscardMode(false);
                                setSelectedHandCardId("");
                              }}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(255,255,255,0.06)",
                                color: "#fff",
                                cursor: "pointer",
                                fontWeight: 900,
                              }}
                            >
                              Отмена
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.75 }}>Сброс уже использован.</div>
                      )}
                    </div>
                  </>
                )
              ) : null}

              {/* Ghost pick lives here */}
              {phase === "ROUND_GHOST_PICK" ? (
                isGhost ? (
                  <>
                    <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Выберите подсказки</div>
                    {mailbox.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                        {mailbox.map((c) => (
                          <CardBtn key={c.id} card={c} selected={ghostPickIds.includes(c.id)} onClick={() => toggleGhostPick(c.id)} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>Писем нет: можно выложить 1 карту из руки или пропустить.</div>
                    )}

                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>+1 из вашей руки (опционально)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                      {hand.map((c) => (
                        <CardBtn key={c.id} card={c} selected={ghostExtraId === c.id} onClick={() => setGhostExtraId(ghostExtraId === c.id ? "" : c.id)} />
                      ))}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        disabled={ghostPickIds.length === 0 && !ghostExtraId}
                        onClick={submitGhostPick}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: ghostPickIds.length || ghostExtraId ? "#16a34a" : "rgba(255,255,255,0.06)",
                          color: "#fff",
                          cursor: ghostPickIds.length || ghostExtraId ? "pointer" : "not-allowed",
                          opacity: ghostPickIds.length || ghostExtraId ? 1 : 0.6,
                          fontWeight: 900,
                        }}
                      >
                        Показать
                      </button>
                    

                      <button
                        onClick={() => {
                          socket.emit("game:ghostletters:ghostPick", { code, playerId: myPid, pickedIds: [], extraFromHandId: null }, (res: any) => {
                            if (!res?.ok) alert(res?.error ?? "Не получилось пропустить");
                            else {
                              setGhostPickIds([]);
                              setGhostExtraId("");
                              setMailbox([]);
                            }
                          });
                        }}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "#ef4444",
                          color: "#fff",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        Пропустить
                      </button>

                      </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.8 }}>Ждём призрака…</div>
                )
              ) : null}

              {/* Default hand view (for other phases) */}
              {phase !== "ROUND_SEND" && phase !== "ROUND_GHOST_PICK" ? (
                <>
                  <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                    {isGhost ? "Рука призрака" : "Ваша рука"} ({hand.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {hand.length === 0 ? <div style={{ fontSize: 13, opacity: 0.7 }}>—</div> : hand.map((c) => <CardBtn key={c.id} card={c} disabled />)}
                  </div>
                </>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Логи игры</div>
              {renderVoteHistory()}
            </div>
          </div>

          {/* CENTER: clue field + main phase */}
          <div style={{ display: "grid", gap: 12 }}>
            {tableReady ? (
              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Поле улик</div>

                <div style={{ maxWidth: 980, width: "fit-content", margin: "0 auto" }}>

                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Мотив</div>
                  <RowVote
                    cards={fieldMotive}
                    selectedId={phase === "KILLER_PICK_CASE" ? killerPick.motiveId : myVote.MOTIVE}
                    onVote={(id) => {
                      if (phase === "KILLER_PICK_CASE") setKillerPick((p) => ({ ...p, motiveId: id }));
                      else vote("MOTIVE", id);
                    }}
                    disabled={
                      phase === "SETUP_DRAFT"
                        ? true
                        : phase === "KILLER_PICK_CASE"
                          ? !isKiller
                          : isSpectator || !(phase === "FINAL_VOTE_MOTIVE")
                    }
                    reactions={gs.reactions ?? {}}
                    players={snap.players}
                    myPid={myPid}
                    onReact={reactToCard}
                    onOpenReactionList={onOpenReactionList}
                    canReact={canReact}
                  />

                  <div style={{ fontWeight: 900, marginBottom: 6, marginTop: 12 }}>Место</div>
                  <RowVote
                    cards={fieldPlace}
                    selectedId={phase === "KILLER_PICK_CASE" ? killerPick.placeId : myVote.PLACE}
                    onVote={(id) => {
                      if (phase === "KILLER_PICK_CASE") setKillerPick((p) => ({ ...p, placeId: id }));
                      else vote("PLACE", id);
                    }}
                    disabled={
                      phase === "SETUP_DRAFT"
                        ? true
                        : phase === "KILLER_PICK_CASE"
                          ? !isKiller
                          : isSpectator || !(phase === "FINAL_VOTE_PLACE")
                    }
                    reactions={gs.reactions ?? {}}
                    players={snap.players}
                    myPid={myPid}
                    onReact={reactToCard}
                    onOpenReactionList={onOpenReactionList}
                    canReact={canReact}
                  />

                  <div style={{ fontWeight: 900, marginBottom: 6, marginTop: 12 }}>Способ</div>
                  <RowVote
                    cards={fieldMethod}
                    selectedId={phase === "KILLER_PICK_CASE" ? killerPick.methodId : myVote.METHOD}
                    onVote={(id) => {
                      if (phase === "KILLER_PICK_CASE") setKillerPick((p) => ({ ...p, methodId: id }));
                      else vote("METHOD", id);
                    }}
                    disabled={
                      phase === "SETUP_DRAFT"
                        ? true
                        : phase === "KILLER_PICK_CASE"
                          ? !isKiller
                          : isSpectator || !(phase === "FINAL_VOTE_METHOD")
                    }
                    reactions={gs.reactions ?? {}}
                    players={snap.players}
                    myPid={myPid}
                    onReact={reactToCard}
                    onOpenReactionList={onOpenReactionList}
                    canReact={canReact}
                  />

                  {phase === "FINAL_VOTE_KILLER" ? (
                    <>
                      <div style={{ fontWeight: 900, marginBottom: 6, marginTop: 12 }}>Кого в клетку</div>
                      <ArrestVoteRow
                        players={snap.players}
                        eligibleIds={eligibleArrestIds}
                        selectedId={myVote.KILLER}
                        disabled={isSpectator}
                        onVote={(pid) => vote("KILLER", pid)}
                      />
                    </>
                  ) : null}

                  {renderLiveVotes()}

                  {phase === "KILLER_PICK_CASE" ? (
                    <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.25)" }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Киллер задаёт дело</div>
                      <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 10 }}>
                        {isKiller ? "Кликни по 1 улице в каждой строке, затем нажми “Задать дело”." : "Ждём киллера…"}
                      </div>
                      <button
                        onClick={submitKillerCase}
                        disabled={!isKiller || !killerPick.motiveId || !killerPick.placeId || !killerPick.methodId}
                        style={btnStyle(!isKiller || !killerPick.motiveId || !killerPick.placeId || !killerPick.methodId)}
                      >
                        Задать дело
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16, minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                Поле улик ещё собирается…
              </div>
            )}

            {/* Keep other phase-heavy panels centered (setup / killer pick / discuss / final arrest) */}
            {phase === "SETUP_DRAFT" ? (
              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Выбор улик</div>
                <div style={{ opacity: 0.75, marginBottom: 10 }}>Улики сразу появляются в основном поле. Когда твой ход — выбери категорию для своей улики.</div>

<div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ fontWeight: 900 }}>
                    Ход игрока: {snap.players.find((p) => p.playerId === gs.setup.currentTurnPlayerId)?.name ?? "?"}
                  </div>

                  {isMyDraftTurn ? (
                    <>
                      <div style={{ marginTop: 10, opacity: 0.85 }}>Твоя улика:</div>
                      <div style={{ marginTop: 10 }}>{draftCard ? <CardBtn card={draftCard} disabled w={160} h={112} /> : <div style={{ opacity: 0.7 }}>…</div>}</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <button onClick={() => setupPlace("MOTIVE")} disabled={!draftCard || board.MOTIVE.length >= 4} style={btnStyle(!draftCard || board.MOTIVE.length >= 4)}>В МОТИВ</button>
                        <button onClick={() => setupPlace("PLACE")} disabled={!draftCard || board.PLACE.length >= 4} style={btnStyle(!draftCard || board.PLACE.length >= 4)}>В МЕСТО</button>
                        <button onClick={() => setupPlace("METHOD")} disabled={!draftCard || board.METHOD.length >= 4} style={btnStyle(!draftCard || board.METHOD.length >= 4)}>В СПОСОБ</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: 10, opacity: 0.75 }}>Ждём, пока текущий игрок положит улику.</div>
                  )}
                </div>
              </div>
            ) : null}

            {/* KILLER_PICK_CASE теперь делается прямо кликами по основному полю улик выше */}

            {phase === "KILLER_GUESS_SPECIAL" ? (
              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Последний шанс убийцы</div>
                <div style={{ opacity: 0.75, marginBottom: 10 }}>
                  Если в игре есть Свидетель и/или Эксперт — убийца может попытаться угадать одну из этих ролей.
                </div>

                {isKiller ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ opacity: 0.85, fontWeight: 800 }}>Цель:</div>
                      <select
                        value={guessTarget}
                        onChange={(e) => setGuessTarget(e.target.value)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.06)",
                          color: "#fff",
                          minWidth: 220,
                        }}
                      >
                        <option value="" style={{ backgroundColor: "#ffffff", color: "#111" }}>— выбрать игрока —</option>
                        {snap.players
                          .filter((p) => !p.spectator)
                          .filter((p) => p.playerId !== myPid)
                          .map((p) => {
                            const bg = p.color ?? "#ffffff";
                            const fg = textColorOn(bg);
                            return (
                              <option
                                key={p.playerId}
                                value={p.playerId}
                                style={{
                                  backgroundColor: bg,
                                  color: fg,
                                }}
                              >
                                {`● ${p.name}`}
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ opacity: 0.85, fontWeight: 800 }}>Роль:</div>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="radio" checked={guessRole === "WITNESS"} onChange={() => setGuessRole("WITNESS")} />
                        <span>Свидетель</span>
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="radio" checked={guessRole === "EXPERT"} onChange={() => setGuessRole("EXPERT")} />
                        <span>Эксперт</span>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={killerGuess}
                        disabled={!guessTarget}
                        style={btnStyle(!guessTarget)}
                      >
                        Угадать
                      </button>
                      <div style={{ fontSize: 13, opacity: 0.75 }}>Одна попытка. Если угадал — победил.</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ opacity: 0.75 }}>Ждём убийцу…</div>
                )}
              </div>
            ) : null}
          </div>

          {/* RIGHT: role info + hints + vote logs */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Роль и инфо</div>
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>
                <div>Вы: <b>{myName}</b>{isSpectator ? " (зритель)" : ""}</div>
                <div style={{ marginTop: 6 }}>Роль: <b>{role ?? "—"}</b></div>

                {(() => {
                  const cf = correctClues ?? caseFile;
                  if (!cf) return null;
                  const motive = posById(gs.table.motive, cf.motiveId) ?? "?";
                  const place = posById(gs.table.place, cf.placeId) ?? "?";
                  const method = posById(gs.table.method, cf.methodId) ?? "?";
                  return (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.25)' }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Дело{role === 'DETECTIVE' ? '' : ' (секретно)'}</div>
                      <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.35 }}>
                        <div><b>Мотив:</b> {motive}</div>
                        <div><b>Место:</b> {place}</div>
                        <div><b>Способ:</b> {method}</div>
                      </div>
                    </div>
                  );
                })()}

                {role === "GHOST" ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    <div>Вы Призрак: выбирайте подсказки и ведите игру.</div>
                    <div style={{ marginTop: 8, opacity: 0.95 }}>
                      <div><b>Убийца:</b> {killerId ? <PlayerLabel players={snap.players} pid={killerId} /> : "—"}</div>
                      <div><b>Сообщник(и):</b> {(accompliceIds || []).length ? (accompliceIds || []).map((id, i) => (<span key={id} style={{display:"inline-flex", alignItems:"center", gap:6}}>{i>0?", ":""}<PlayerLabel players={snap.players} pid={id} /></span>)) : "—"}</div>
                      <div><b>Свидетель:</b> {witnessId ? <PlayerLabel players={snap.players} pid={witnessId} /> : "—"}</div>
                      <div><b>Эксперт:</b> {expertId ? <PlayerLabel players={snap.players} pid={expertId} /> : "—"}</div>
                    </div>
                  </div>
                ) : null}

                {role === "KILLER" ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    Вы Убийца. Ваш сообщник(и): <b>{(accompliceIds || []).length ? (accompliceIds || []).map((id, i) => (<span key={id} style={{display:"inline-flex", alignItems:"center", gap:6}}>{i>0?", ":""}<PlayerLabel players={snap.players} pid={id} /></span>)) : "—"}</b>
                  </div>
                ) : null}

                {role === "ACCOMPLICE" ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    Вы Сообщник. Убийца: <b>{killerId ? <PlayerLabel players={snap.players} pid={killerId} /> : "—"}</b>
                  </div>
                ) : null}

                {role === "WITNESS" ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    Вы Свидетель. Убийца: <b>{killerId ? <PlayerLabel players={snap.players} pid={killerId} /> : "—"}</b>
                  </div>
                ) : null}

                {role === "EXPERT" ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    <div>Вы Эксперт. Вам известны 3 истинные улики:</div>
                    <div style={{ marginTop: 6 }}>
                      <b>
                        {correctClues
                          ? `Мотив ${posById(gs.table.motive, correctClues.motiveId) ?? "?"}, ` +
                            `Место ${posById(gs.table.place, correctClues.placeId) ?? "?"}, ` +
                            `Способ ${posById(gs.table.method, correctClues.methodId) ?? "?"}`
                          : "—"}
                      </b>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Подсказки призрака</div>
              <HintsPanel hints={gs.revealedHints ?? []} />
            </div>

            {/* vote logs moved under player's hand */}
          </div>
        </div>

        {/* Reaction list popup */}
        {rxOpen && rxAnchor ? (
          <ReactionPopover open={rxOpen} anchorRect={rxAnchor} emoji={rxEmoji} users={rxUsers} onClose={() => setRxOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}

function nameById(players: Player[], pid: string) {
  return players.find((p) => p.playerId === pid)?.name ?? pid;
}

function playerById(players: Player[], pid: string) {
  return players.find((p) => p.playerId === pid);
}

function colorById(players: Player[], pid: string) {
  return playerById(players, pid)?.color;
}

function textColorOn(bg?: string) {
  // bg can be like "#RRGGBB" (preferred). fallback to dark text
  if (!bg || !bg.startsWith("#") || (bg.length !== 7 && bg.length !== 4)) return "#111";
  const hex =
    bg.length === 4 ? `#${bg[1]}${bg[1]}${bg[2]}${bg[2]}${bg[3]}${bg[3]}` : bg;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#111" : "#fff";
}

function ColorDot({ color, size = 8 }: { color?: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color ?? "rgba(255,255,255,0.18)",
        border: "1px solid rgba(255,255,255,0.18)",
        display: "inline-block",
        flex: "0 0 auto",
        marginRight: 6,
        marginLeft: 4,
      }}
    />
  );
}

function PlayerLabel({ players, pid }: { players: Player[]; pid: string }) {
  const p = playerById(players, pid);
  return (
    <span style={{ display: "inline-flex", alignItems: "center"}}>
      <ColorDot color={p?.color} />
      <span>{p?.name ?? pid}</span>
    </span>
  );
}

function labelById(cards: Card[], id: string) {
  return cards.find((c) => c.id === id)?.label ?? id;
}

function posById(cards: Card[], id: string) {
  const idx = cards.findIndex((c) => c.id === id);
  return idx >= 0 ? idx + 1 : null;
}

function TopBar({
  code,
  phase,
  round,
  role,
  spectator,
  myName,
  isHost,
  caseFile,
  killerId,
  accompliceIds,
  witnessId,
  expertId,
  correctClues,
  players,
  table,
  onRestart,
  showRestart,
}: {
  code: string;
  phase: string;
  round: number;
  role: string | null;
  spectator: boolean;
  myName: string;
  isHost: boolean;
  caseFile: any;
  killerId: string | null;
  accompliceIds: string[];
  witnessId: string | null;
  expertId: string | null;
  correctClues: any;
  players: Player[];
  table: { motive: Card[]; place: Card[]; method: Card[] };
  onRestart: () => void;
  showRestart: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <div>
        <h1 style={{ margin: 0 }}>Письма призрака • {code}</h1>
        <div style={{ opacity: 0.75, fontSize: 13, marginTop: 6 }}>
          Фаза: {phase} • Раунд: {round} • Ты: <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{myName}</span> • Роль: {spectator ? "SPECTATOR" : role ?? "?"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {/* Role-specific secret box */}
        {(() => {
          if (spectator) {
            return (
              <div style={{ fontSize: 12, opacity: 0.9, border: "1px solid #333", background: "#0d0d14", padding: "8px 10px", borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Зритель</div>
                <div style={{ opacity: 0.8 }}>Ты присоединился после старта игры.</div>
                <div style={{ opacity: 0.8 }}>Станешь игроком со следующей новой игрой.</div>
              </div>
            );
          }

          // Witness: only killer
          if (role === "WITNESS" && killerId) {
            return (
              <div style={{ fontSize: 12, opacity: 0.9, border: "1px solid #333", background: "#0d0d14", padding: "8px 10px", borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Секрет</div>
                <div><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>Убийца: <PlayerLabel players={players} pid={killerId} /></span></div>
              </div>
            );
          }

          // Expert: only correct clues
          if (role === "EXPERT" && correctClues) {
            return (
              <div style={{ fontSize: 12, opacity: 0.9, border: "1px solid #333", background: "#0d0d14", padding: "8px 10px", borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Правильные улики</div>
                <div>Мотив: {posById(table.motive, correctClues.motiveId) ?? "?"}</div>
                <div>Место: {posById(table.place, correctClues.placeId) ?? "?"}</div>
                <div>Способ: {posById(table.method, correctClues.methodId) ?? "?"}</div>
              </div>
            );
          }

          // Killer: case + accomplices
          if (role === "KILLER" && caseFile) {
            return (
              <div style={{ fontSize: 12, opacity: 0.9, border: "1px solid #333", background: "#0d0d14", padding: "8px 10px", borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Дело (секрет)</div>
                {accompliceIds?.length ? (
                  <div style={{ marginBottom: 6 }}>Сообщник: {accompliceIds.map((id, i) => (<span key={id} style={{display:"inline-flex", alignItems:"center", gap:6}}>{i>0?", ":""}<PlayerLabel players={players} pid={id} /></span>))}</div>
                ) : null}
                <div>Мотив: {posById(table.motive, caseFile.motiveId) ?? "?"}</div>
                <div>Место: {posById(table.place, caseFile.placeId) ?? "?"}</div>
                <div>Способ: {posById(table.method, caseFile.methodId) ?? "?"}</div>
              </div>
            );
          }

          // Accomplice: case + killer
          if (role === "ACCOMPLICE" && caseFile) {
            return (
              <div style={{ fontSize: 12, opacity: 0.9, border: "1px solid #333", background: "#0d0d14", padding: "8px 10px", borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Дело (секрет)</div>
                {killerId ? <div style={{ marginBottom: 6 }}>Убийца: <PlayerLabel players={players} pid={killerId} /></div> : null}
                <div>Мотив: {posById(table.motive, caseFile.motiveId) ?? "?"}</div>
                <div>Место: {posById(table.place, caseFile.placeId) ?? "?"}</div>
                <div>Способ: {posById(table.method, caseFile.methodId) ?? "?"}</div>
              </div>
            );
          }

          // Ghost: everything
          if (role === "GHOST" && caseFile) {
            return (
              <div style={{ fontSize: 12, opacity: 0.9, border: "1px solid #333", background: "#0d0d14", padding: "8px 10px", borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Дело (секрет)</div>
                {killerId ? <div>Убийца: <PlayerLabel players={players} pid={killerId} /></div> : null}
                {accompliceIds?.length ? <div>Сообщник: {accompliceIds.map((id, i) => (<span key={id} style={{display:"inline-flex", alignItems:"center", gap:6}}>{i>0?", ":""}<PlayerLabel players={players} pid={id} /></span>))}</div> : null}
                {witnessId ? <div>Свидетель: <PlayerLabel players={players} pid={witnessId} /></div> : null}
                {expertId ? <div>Эксперт: <PlayerLabel players={players} pid={expertId} /></div> : null}
                <div style={{ marginTop: 6 }}>Мотив: {posById(table.motive, caseFile.motiveId) ?? "?"}</div>
                <div>Место: {posById(table.place, caseFile.placeId) ?? "?"}</div>
                <div>Способ: {posById(table.method, caseFile.methodId) ?? "?"}</div>
              </div>
            );
          }

          return null;
        })()}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => (window.location.href = `/bg`)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Назад
          </button>
        </div>

        {showRestart && isHost && (
          <button onClick={onRestart} style={btnStyle(false)}>
            Новая игра
          </button>
        )}
      </div>
    </div>
  );
}

function PlayersPanel({
  players,
  isHost,
  myPid,
  onKick,
}: {
  players: Player[];
  isHost: boolean;
  myPid: string;
  onKick: (targetPlayerId: string) => void;
}) {
  return (
    <div style={{ marginTop: 14, border: "1px solid #2a2a3a", background: "#10101a", padding: 14, borderRadius: 16 }}>
      <h2 style={{ marginTop: 0 }}>Игроки</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {players.map((p) => (
          <div key={p.playerId} style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 12, border: "1px solid #333", background: "#0f0f18" }}>
            <ColorDot color={p.color} size={10} />
            <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <span>
                <PlayerLabel players={players} pid={p.playerId} />{p.isHost ? " 👑" : ""}{p.spectator ? " 👀" : ""}
              </span>

              {isHost && p.playerId !== myPid && (
                <button
                  onClick={() => onKick(p.playerId)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    border: "1px solid #444",
                    background: "#2a0f14",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Kick
                </button>
              )}
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}

function HintsPanel({ hints }: { hints: Card[] }) {
  return (
    <div style={{ marginTop: 14, border: "1px solid #2a2a3a", background: "#10101a", padding: 14, borderRadius: 16 }}>
      <h2 style={{ marginTop: 0 }}>Подсказки (все раунды)</h2>
      {hints?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {hints.map((c) => (
            <CardBtn key={c.id} card={c} disabled />
          ))}

        </div>
      ) : (
        <div style={{ opacity: 0.75 }}>Пока нет подсказок</div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: any }) {
  return (
    <div style={{ marginTop: 16, border: "1px solid #2a2a3a", background: "#10101a", padding: 16, borderRadius: 16 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

function CategoryCol({ title, cards, max }: { title: string; cards: Card[]; max: number }) {
  return (
    <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12, background: "#0f0f18" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>
        {title} ({cards.length}/{max})
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #2a2a3a",
              background: cards[i] ? "#10101a" : "#0b0b12",
              opacity: cards[i] ? 1 : 0.6,
            }}
          >
            {cards[i] ? <CardBtn card={cards[i]} disabled /> : "—"}
          </div>
        ))}
      </div>
    </div>
  );
}

function PickCol({
  title,
  cards,
  selectedId,
  onPick,
  disabled,
}: {
  title: string;
  cards: Card[];
  selectedId?: string;
  onPick: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12, background: "#0f0f18" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>
        {cards.map((c) => {
          const selected = selectedId === c.id;
          return (
            <CardBtn
              key={c.id}
              card={c}
              selected={selected}
              disabled={disabled}
              onClick={() => (!disabled ? onPick(c.id) : undefined)}
            />
          );
        })}
      </div>
    </div>
  );
}

function RowVote({
  cards,
  selectedId,
  onVote,
  disabled,
  reactions,
  players,
  myPid,
  onReact,
  onOpenReactionList,
  canReact,
}: {
  cards: Card[];
  selectedId?: string;
  onVote: (id: string) => void;
  disabled: boolean;
  reactions: Record<string, Record<string, "✅" | "❌" | "🤔">>;
  players: Player[];
  myPid: string;
  onReact: (cardId: string, emoji: "✅" | "❌" | "🤔") => void;
  onOpenReactionList: (anchor: DOMRect, emoji: "✅" | "❌" | "🤔", users: string[]) => void;
  canReact: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 10, width: "fit-content" }}>
      {cards.map((c) => {
        const selected = selectedId === c.id;
        const r = reactions?.[c.id] ?? {};
        const myEmoji = r?.[myPid] ?? null;
        const countByEmoji = {
          "✅": 0,
          "❌": 0,
          "🤔": 0,
        } as any;
        for (const [, em] of Object.entries(r)) countByEmoji[em] = (countByEmoji[em] ?? 0) + 1;

        return (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <CardBtn
              card={c}
              selected={selected}
              disabled={disabled}
              onClick={() => (!disabled ? onVote(c.id) : undefined)}
            />

            {/* Reaction controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {(["✅", "❌", "🤔"] as const).map((em) => {
                const active = myEmoji === em;
                const usersForEmoji = Object.entries(r)
                  .filter(([, e]) => e === em)
                  .map(([pid]) => players.find((p) => p.playerId === pid)?.name ?? "???");
                const cnt = countByEmoji[em] ?? 0;
                return (
                  <button
                    key={em}
                    onClick={() => (canReact ? onReact(c.id, em) : undefined)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenReactionList(e.currentTarget.getBoundingClientRect(), em, usersForEmoji);
                    }}
                    style={{
                      border: active ? "1px solid #22c55e" : "1px solid #333",
                      background: "#0f0f18",
                      borderRadius: 10,
                      padding: "4px 8px",
                      cursor: canReact ? "pointer" : "not-allowed",
                      opacity: canReact ? 0.95 : 0.45,
                      position: "relative",
                      width: 44,
                      height: 30,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={active ? "Убрать реакцию" : "Поставить реакцию"}

                  >
                    <span style={{ fontSize: 14, lineHeight: "14px" }}>{em}</span>
                    {cnt > 0 ? (
                      <span
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          minWidth: 18,
                          height: 18,
                          padding: "0 5px",
                          borderRadius: 999,
                          background: "#1d4ed8",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 900,
                          display: "grid",
                          placeItems: "center",
                          border: "1px solid rgba(255,255,255,0.12)",
                          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                          pointerEvents: "none",
                        }}
                      >
                        {cnt}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

        );
      })}
    </div>
  );
}

function ArrestVoteRow({
  players,
  eligibleIds,
  selectedId,
  disabled,
  onVote,
}: {
  players: Player[];
  eligibleIds: string[];
  selectedId?: string;
  disabled: boolean;
  onVote: (pid: string) => void;
}) {
  const list = (eligibleIds?.length ? eligibleIds : players.map((p) => p.playerId))
    .map((pid) => players.find((p) => p.playerId === pid))
    .filter(Boolean) as Player[];

  // stable order
  list.sort((a, b) => (a.name > b.name ? 1 : -1));

  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 10, width: "fit-content" }}>
      {list.map((p) => {
        const active = selectedId === p.playerId;
        return (
          <button
            key={p.playerId}
            disabled={disabled}
            onClick={() => (!disabled ? onVote(p.playerId) : undefined)}
            style={{
              padding: "10px 12px",
              borderRadius: 999,
              border: active ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.14)",
              background: active ? "rgba(34,197,94,0.20)" : "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              fontWeight: 900,
            }}
            title={disabled ? "Голосование сейчас недоступно" : "Проголосовать"}
          ><span style={{ display: "inline-flex", alignItems: "center" }}><ColorDot color={p.color} />{p.name}</span></button>
        );
      })}
    </div>
  );
}





function ReactionPopover({
  open,
  anchorRect,
  emoji,
  users,
  onClose,
}: {
  open: boolean;
  anchorRect: DOMRect | null;
  emoji: "✅" | "❌" | "🤔";
  users: string[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onClose();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const padding = 8;
  const width = 240;
  const maxH = 260;

  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;

  if (left + width + padding > window.innerWidth) left = window.innerWidth - width - padding;
  if (left < padding) left = padding;

  // if no space below -> render above
  const estH = Math.min(maxH, 44 + users.length * 34);
  if (top + estH + padding > window.innerHeight) {
    top = anchorRect.top - 8 - estH;
  }
  if (top < padding) top = padding;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left,
        top,
        width,
        maxHeight: maxH,
        zIndex: 9999,
        borderRadius: 14,
        border: "1px solid #2a2a3a",
        background: "#0b0b14",
        boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e1e2c", fontWeight: 800 }}>
        {emoji} <span style={{ opacity: 0.65, fontWeight: 600 }}>({users.length})</span>
      </div>

      <div style={{ overflowY: "auto", maxHeight: 210 }}>
        {users.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.7 }}>Пока никто</div>
        ) : (
          users.map((u, i) => (
            <div
              key={`${u}-${i}`}
              style={{
                padding: "10px 12px",
                borderBottom: i === users.length - 1 ? "none" : "1px solid #121220",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "#141427",
                  border: "1px solid #232338",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                }}
              >
                {u.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #444",
    background: disabled ? "#222" : "#1d4ed8",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function chipStyle(selected = false, disabled = false): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #333",
    background: selected ? "#1d4ed8" : "#0f0f18",
    color: "#eee",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.75 : 1,
  };
}

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #333",
  background: "#0f0f18",
  color: "#eee",
  width: "100%",
};


function CardBtn({
  card,
  onClick,
  mode,
  selected,
  disabled,
  w,
  h,
}: {
  card: Card;
  onClick?: () => void;
  mode?: "normal" | "discard";
  selected?: boolean;
  disabled?: boolean;
  w?: number;
  h?: number;

}) {
  const [broken, setBroken] = useState(false);
  const [hover, setHover] = useState(false);

  const imgSrc = `/ghostletters/cards/${card.assetId}.svg`;

  const base = chipStyle(false) as any;

  const selectedStyling: React.CSSProperties = selected
    ? (mode === "discard"
      ? { border: "2px solid #ef4444", boxShadow: "0 0 0 2px rgba(239,68,68,0.25)" }
      : { border: "2px solid #22c55e", boxShadow: "0 0 0 2px rgba(34,197,94,0.25)" })
    : {};

  const discardStyling =
    mode === "discard"
      ? {
        border: "1px solid #ef4444",
      }
      : {};

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...base,
        ...discardStyling,
        ...selectedStyling,
        padding: 0,
        overflow: "hidden",
        width: w ?? 120,
        height: h ?? 84,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",

        opacity: disabled ? 0.85 : 1,
        cursor: disabled ? "default" : "pointer",

        // selected поверх всего
        border: selected ? "2px solid #60a5fa" : (discardStyling as any).border ?? base.border,

        // hover zoom
        position: "relative",
        zIndex: hover ? 50 : 1,
        transform: hover ? "translateY(-8px) scale(1.45)" : "translateY(0) scale(1)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
        boxShadow: hover ? "0 18px 45px rgba(0,0,0,0.45)" : "none",
      }}
    >
      {!broken ? (
        <img
          src={imgSrc}
          alt={card.label}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <div style={{ padding: 10, fontSize: 13, lineHeight: 1.1, textAlign: "left" }}>{card.label}</div>
      )}
    </button>
  );
}
