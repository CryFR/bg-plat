"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../../socket";
import { getPlayerId, getSavedName } from "../../player";

type Card = { id: string; label: string; assetId: string };
type Player = { playerId: string; socketId: string; name: string; isHost: boolean; ready: boolean; connected: boolean; spectator: boolean; };
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
      setCaseFile(m?.caseFile ?? null);
      setKillerId(m?.killerId ?? null);
      setAccompliceIds(Array.isArray(m?.accompliceIds) ? m.accompliceIds : []);
      setWitnessId(m?.witnessId ?? null);
      setExpertId(m?.expertId ?? null);
      setCorrectClues(m?.correctClues ?? null);
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
      console.warn("[room:error]", p);
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
    else if (phase === "FINAL_ARREST") {
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
                  {nameById(snap.players, it.pid)}
                </div>
                <div style={{ fontWeight: 800, opacity: 0.95 }}>
                  {phase === "FINAL_ARREST" ? nameById(snap.players, it.value) : it.value}
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

  const tableReady = (gs.table?.motive?.length ?? 0) > 0 || (gs.table?.place?.length ?? 0) > 0 || (gs.table?.method?.length ?? 0) > 0;

  // result payload may be in gs.result or gs.final.result
  const resultPayload = gs.result ?? gs.final?.result ?? null;

  const eligibleArrestIds: string[] =
    gs.public?.eligibleArrestPlayerIds?.length
      ? gs.public.eligibleArrestPlayerIds
      : snap.players.map((p) => p.playerId);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <TopBar
        code={code}
        phase={phase ?? "?"}
        round={gs.round}
        role={role}
        spectator={isSpectator}
        myName={myName}
        isHost={isHost}
        caseFile={caseFile}
        killerId={killerId}
        accompliceIds={accompliceIds}
        witnessId={witnessId}
        expertId={expertId}
        correctClues={correctClues}
        players={snap.players}
        table={gs.table}
        onRestart={restart}
        showRestart={true}
      />

      <PlayersPanel
        players={snap.players}
        isHost={isHost}
        myPid={myPid}
        onKick={(targetPlayerId) =>
          socket.emit("room:kick", { code, byPlayerId: myPid, targetPlayerId })
        }
      />


      <HintsPanel hints={gs.revealedHints ?? []} />

      {/* Field is always visible once assembled */}
      {tableReady && (
        <Panel title="Поле улик">
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Мотив</h3>
          <RowVote
            cards={gs.table.motive}
            selectedId={myVote.MOTIVE}
            onVote={(id) => vote("MOTIVE", id)}
            disabled={isSpectator || !(phase === "FINAL_VOTE_MOTIVE")}
            reactions={gs.reactions ?? {}}
            players={snap.players}
            myPid={myPid}
            onReact={reactToCard}
            onOpenReactionList={onOpenReactionList}
            canReact={canReact}
          />

          <h3 style={{ marginBottom: 6, marginTop: 12 }}>Место</h3>
          <RowVote
            cards={gs.table.place}
            selectedId={myVote.PLACE}
            onVote={(id) => vote("PLACE", id)}
            disabled={isSpectator || !(phase === "FINAL_VOTE_PLACE")}
            reactions={gs.reactions ?? {}}
            players={snap.players}
            myPid={myPid}
            onReact={reactToCard}
            onOpenReactionList={onOpenReactionList}
            canReact={canReact}
          />

          <h3 style={{ marginBottom: 6, marginTop: 12 }}>Способ</h3>
          <RowVote
            cards={gs.table.method}
            selectedId={myVote.METHOD}
            onVote={(id) => vote("METHOD", id)}
            disabled={isSpectator || !(phase === "FINAL_VOTE_METHOD")}
            reactions={gs.reactions ?? {}}
            players={snap.players}
            myPid={myPid}
            onReact={reactToCard}
            onOpenReactionList={onOpenReactionList}
            canReact={canReact}
          />


          {renderLiveVotes()}
          {renderVoteHistory()}
          {(phase === "FINAL_VOTE_MOTIVE" || phase === "FINAL_VOTE_PLACE" || phase === "FINAL_VOTE_METHOD") && (
            <div style={{ opacity: 0.7, fontSize: 13, marginTop: 10 }}>
              Сейчас активна стадия голосования: <b>{phase}</b>. Нажимай на улику, чтобы проголосовать.
            </div>
          )}
        </Panel>
      )}

      {/* SETUP */}
      {phase === "SETUP_DRAFT" && (
        <Panel title="Сбор поля улик">
          <p style={{ opacity: 0.75, marginTop: 6 }}>
            Игроки по кругу берут 1 улику и кладут в категорию, где ещё не выложено 4 улики.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <CategoryCol title="МОТИВ" cards={board.MOTIVE} max={4} />
            <CategoryCol title="МЕСТО" cards={board.PLACE} max={4} />
            <CategoryCol title="СПОСОБ" cards={board.METHOD} max={4} />
          </div>

          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #333", background: "#0d0d14" }}>
            <div style={{ fontWeight: 700 }}>
              Ход игрока: {snap.players.find((p) => p.playerId === gs.setup.currentTurnPlayerId)?.name ?? "?"}
            </div>

            {isMyDraftTurn ? (
              <>
                <div style={{ marginTop: 10, opacity: 0.85 }}>
                  Твоя улика:
                </div>

                <div style={{ marginTop: 10 }}>
                  {draftCard ? (
                    <div
                      style={{
                        width: 160,
                        height: 112,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        marginBottom: 10, // <-- резервируем место, чтобы не наезжало на кнопки
                      }}
                    >
                      <div style={{ marginTop: 10, marginBottom: 12 }}>
                        <CardBtn card={draftCard} disabled w={160} h={112} />
                      </div>

                    </div>
                  ) : (
                    <div style={{ opacity: 0.7, marginBottom: 10 }}>...</div>
                  )}
                </div>


                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setupPlace("MOTIVE")} disabled={!draftCard || board.MOTIVE.length >= 4} style={btnStyle(!draftCard || board.MOTIVE.length >= 4)}>
                    В МОТИВ
                  </button>
                  <button onClick={() => setupPlace("PLACE")} disabled={!draftCard || board.PLACE.length >= 4} style={btnStyle(!draftCard || board.PLACE.length >= 4)}>
                    В МЕСТО
                  </button>
                  <button onClick={() => setupPlace("METHOD")} disabled={!draftCard || board.METHOD.length >= 4} style={btnStyle(!draftCard || board.METHOD.length >= 4)}>
                    В СПОСОБ
                  </button>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 10, opacity: 0.75 }}>Ждём, пока текущий игрок положит улику.</div>
            )}
          </div>
        </Panel>
      )}

      {/* KILLER PICK CASE */}
      {phase === "KILLER_PICK_CASE" && (
        <Panel title="Киллер задаёт дело">
          <p style={{ opacity: 0.75, marginTop: 6 }}>
            Киллер выбирает по 1 улице из каждой категории: Мотив, Место, Способ.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <PickCol title="МОТИВ" cards={gs.table.motive} selectedId={killerPick.motiveId} onPick={(id) => setKillerPick((p) => ({ ...p, motiveId: id }))} disabled={!isKiller} />
            <PickCol title="МЕСТО" cards={gs.table.place} selectedId={killerPick.placeId} onPick={(id) => setKillerPick((p) => ({ ...p, placeId: id }))} disabled={!isKiller} />
            <PickCol title="СПОСОБ" cards={gs.table.method} selectedId={killerPick.methodId} onPick={(id) => setKillerPick((p) => ({ ...p, methodId: id }))} disabled={!isKiller} />
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={submitKillerCase} disabled={!isKiller || !killerPick.motiveId || !killerPick.placeId || !killerPick.methodId} style={btnStyle(!isKiller || !killerPick.motiveId || !killerPick.placeId || !killerPick.methodId)}>
              Задать дело
            </button>
            <span style={{ opacity: 0.7, fontSize: 13 }}>{isKiller ? "Выбери 3 улики" : "Ждём киллера"}</span>
          </div>
        </Panel>
      )}

      {/* MAIN */}
      {/* ===== ROUND_SEND: discard (опционально) + send (обязательно) ===== */}
      {phase === "ROUND_SEND" && (
        <Panel title="Раунд: отправка письма">
          {isGhost ? (
            <div style={{ opacity: 0.75 }}>Ты Призрак — жди письма.</div>
          ) : (
            <>
              <div style={{ opacity: 0.75, marginBottom: 10 }}>
                Рука всегда 5. За раунд можно отправить только 1 письмо. Можно (опционально) сбросить 1 карту в начале раунда и добрать до 5.
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
                    ...btnStyle(false),
                    border: discardMode ? "1px solid #333" : "1px solid #22c55e",
                    color: discardMode ? "#fff" : "#eafff1",
                    opacity: isSpectator || discardMode || !selectedHandCardId ? 0.6 : 1,
                    cursor: isSpectator || discardMode || !selectedHandCardId ? "not-allowed" : "pointer",
                  }}
                  title={
                    isSpectator
                      ? "Ты зритель — станешь игроком со следующей партией"
                      : discardMode
                        ? "Сначала выйди из режима сброса"
                        : !selectedHandCardId
                          ? "Выбери карту, затем нажми"
                          : "Отправить выбранную карту"
                  }
                >
                  Отправить улику
                </button>

                {!didDiscardThisRound && (
                  <>
                    <button
                      disabled={isSpectator}
                      onClick={() => {
                        if (isSpectator) return;
                        if (!discardMode) {
                          setDiscardMode(true);
                          return;
                        }
                        if (!selectedHandCardId) {
                          alert("Выбери карту для сброса");
                          return;
                        }
                        discard(selectedHandCardId);
                        setSelectedHandCardId("");
                      }}
                      style={{
                        ...btnStyle(false),
                        border: "1px solid #ef4444",
                        background: "#2b2b3a",
                        opacity: isSpectator ? 0.5 : !discardMode && didDiscardThisRound ? 0.6 : 1,
                        cursor: isSpectator ? "not-allowed" : "pointer",
                      }}
                      title={discardMode ? "Подтвердить сброс выбранной карты" : "Войти в режим сброса (нужно выбрать карту и подтвердить)"}
                    >
                      {discardMode ? "Подтвердить сброс" : "Сбросить 1 карту"}
                    </button>

                    {discardMode && (
                      <button
                        onClick={() => {
                          setDiscardMode(false);
                          setSelectedHandCardId("");
                        }}
                        style={btnStyle(false)}
                      >
                        Отмена
                      </button>
                    )}
                  </>
                )}

                {didDiscardThisRound && (
                  <span style={{ opacity: 0.7, fontSize: 13 }}>
                    Сброс на этот раунд уже использован.
                  </span>
                )}
              </div>
            </>
          )}
        </Panel>
      )}



      {phase === "ROUND_GHOST_PICK" && (
        <Panel title="Призрак выбирает подсказки">
          {isGhost ? (
            <>
              {/* Письма детективов (может быть пусто на первой подсказке) */}
              {mailbox.length > 0 ? (
                <>
                  <div style={{ opacity: 0.8, marginBottom: 8 }}>Письма детективов:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {mailbox.map((c) => {
                      const selected = ghostPickIds.includes(c.id);
                      return (
                        <CardBtn
                          key={c.id}
                          card={c}
                          selected={selected}
                          onClick={() => toggleGhostPick(c.id)}
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ opacity: 0.75 }}>Писем нет (первая зацепка): можешь выложить 1 карту из руки или пропустить.</div>
              )}

              {/* +1 из руки призрака (опционально) */}
              <div style={{ marginTop: 12, opacity: 0.85 }}>+1 карта из твоей руки (можно пропустить):</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                {hand.map((c) => {
                  const selected = ghostExtraId === c.id;
                  return (
                    <CardBtn
                      key={c.id}
                      card={c}
                      selected={selected}
                      onClick={() => setGhostExtraId(selected ? "" : c.id)}
                    />
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    // пропуск
                    socket.emit(
                      "game:ghostletters:ghostPick",
                      { code, playerId: myPid, pickedIds: [], extraFromHandId: null },
                      (res: any) => {
                        if (!res?.ok) alert(res?.error ?? "Не получилось пропустить");
                        else {
                          setGhostPickIds([]);
                          setGhostExtraId("");
                          setMailbox([]);
                        }
                      }
                    );
                  }}
                  style={btnStyle(false)}
                >
                  Пропустить
                </button>

                <button
                  disabled={ghostPickIds.length === 0 && !ghostExtraId}
                  onClick={submitGhostPick}
                  style={btnStyle(ghostPickIds.length === 0 && !ghostExtraId)}
                >
                  Показать выбранные (останутся на поле)
                </button>
              </div>
            </>
          ) : (
            <div style={{ opacity: 0.75 }}>Ждём призрака…</div>
          )}
        </Panel>
      )}


      {phase === "ROUND_DISCUSS" && (
        <Panel title="Обсуждение">
          <div style={{ opacity: 0.75 }}>Обсуждайте. Хост переводит дальше.</div>
          {isHost ? (
            <button onClick={nextRound} style={{ ...btnStyle(false), marginTop: 12 }}>
              Следующий шаг
            </button>
          ) : (
            <div style={{ opacity: 0.7, fontSize: 13, marginTop: 10 }}>Ждём хоста</div>
          )}
        </Panel>
      )}

      {/* FINAL VOTE KILLER (without ghost in candidates) */}
      {phase === "FINAL_VOTE_KILLER" && (
        <Panel title="Голосование: кого арестовать как Убийцу">
          <div style={{ opacity: 0.75, marginBottom: 10 }}>
            Голосуют все, кроме Призрака. Арестованные не голосуют. Если арестован Сообщник — будет дополнительный арест.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {eligibleArrestIds.map((pid) => {
              const p = snap.players.find((x) => x.playerId === pid);
              if (!p) return null;
              return (
                <button
                  key={p.playerId}
                  onClick={() => vote("KILLER", p.playerId)}
                  style={{ ...chipStyle(myVote.KILLER === p.playerId), textAlign: "left" }}
                  disabled={isSpectator || isGhost}
                >
                  {p.name} {p.isHost ? "👑" : ""} {p.connected ? "⚡" : "💤"}
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {phase === "KILLER_GUESS_SPECIAL" && (
        <Panel title="Ход Убийцы: определить Свидетеля или Эксперта">
          <div style={{ opacity: 0.75, marginBottom: 10 }}>
            Убийца указывает игрока и называет его роль. Если угадал — Убийца выигрывает.
          </div>

          {isKiller ? (
            <>
              <select value={guessTarget} onChange={(e) => setGuessTarget(e.target.value)} style={selectStyle}>
                <option value="">Выбери игрока</option>
                {snap.players
                  .filter((p) => p.playerId !== myPid)
                  .map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.name}
                    </option>
                  ))}
              </select>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={() => setGuessRole("WITNESS")} style={chipStyle(guessRole === "WITNESS")}>
                  Свидетель
                </button>
                <button onClick={() => setGuessRole("EXPERT")} style={chipStyle(guessRole === "EXPERT")}>
                  Эксперт
                </button>
              </div>

              <button onClick={killerGuess} disabled={!guessTarget} style={{ ...btnStyle(!guessTarget), marginTop: 12 }}>
                Сделать предположение
              </button>
            </>
          ) : (
            <div style={{ opacity: 0.75 }}>Ждём, пока Убийца сделает предположение…</div>
          )}
        </Panel>
      )}

      {phase === "RESULT" && (
        <Panel title="Результат">
          {resultPayload ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                {resultPayload.detectivesWin ? "✅ Детективы победили" : "❌ Детективы проиграли"}
              </div>

              {resultPayload.reason && <div style={{ opacity: 0.8, marginBottom: 10 }}></div>}

              {/* who was killer */}
              {resultPayload.killerPlayerId && (
                <div style={{ opacity: 0.9, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Киллер:</div>
                  <div>{nameById(snap.players, resultPayload.killerPlayerId)}</div>
                </div>
              )}

              {resultPayload.picked && (
                <div style={{ opacity: 0.9, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Выбор детективов:</div>
                  <div>Мотив: {posById(gs.table.motive, resultPayload.picked.motiveId) ?? "?"}</div>
                  <div>Место: {posById(gs.table.place, resultPayload.picked.placeId) ?? "?"}</div>
                  <div>Способ: {posById(gs.table.method, resultPayload.picked.methodId) ?? "?"}</div>
                  {resultPayload.picked.killerPlayerId && <div>Арест: {nameById(snap.players, resultPayload.picked.killerPlayerId)}</div>}
                </div>
              )}

              {resultPayload.caseFile && (
                <div style={{ opacity: 0.9, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Истинное дело:</div>
                  <div>Мотив: {posById(gs.table.motive, resultPayload.caseFile.motiveId) ?? "?"}</div>
                  <div>Место: {posById(gs.table.place, resultPayload.caseFile.placeId) ?? "?"}</div>
                  <div>Способ: {posById(gs.table.method, resultPayload.caseFile.methodId) ?? "?"}</div>
                </div>
              )}

              {Array.isArray(resultPayload.arrestedIds) && resultPayload.arrestedIds.length > 0 && (
                <div style={{ opacity: 0.9, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>В клетке:</div>
                  {resultPayload.arrestedIds.map((pid: string) => (
                    <div key={pid}>🚫 {nameById(snap.players, pid)}</div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ opacity: 0.75 }}>Результат ещё не сформирован (проверь finishResult в ghostLetters.ts)</div>
          )}

          {isHost && (
            <button onClick={restart} style={{ ...btnStyle(false), marginTop: 12 }}>
              Новая игра
            </button>
          )}
        </Panel>
      )}
      <ReactionPopover open={rxOpen} anchorRect={rxAnchor} emoji={rxEmoji} users={rxUsers} onClose={() => setRxOpen(false)} />

    </div>

  );
}

function nameById(players: Player[], pid: string) {
  return players.find((p) => p.playerId === pid)?.name ?? pid;
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
          Фаза: {phase} • Раунд: {round} • Ты: {myName} • Роль: {spectator ? "SPECTATOR" : role ?? "?"}
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
                <div>Убийца: {nameById(players, killerId)}</div>
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
                  <div style={{ marginBottom: 6 }}>Сообщник: {accompliceIds.map((id) => nameById(players, id)).join(", ")}</div>
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
                {killerId ? <div style={{ marginBottom: 6 }}>Убийца: {nameById(players, killerId)}</div> : null}
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
                {killerId ? <div>Убийца: {nameById(players, killerId)}</div> : null}
                {accompliceIds?.length ? <div>Сообщник: {accompliceIds.map((id) => nameById(players, id)).join(", ")}</div> : null}
                {witnessId ? <div>Свидетель: {nameById(players, witnessId)}</div> : null}
                {expertId ? <div>Эксперт: {nameById(players, expertId)}</div> : null}
                <div style={{ marginTop: 6 }}>Мотив: {posById(table.motive, caseFile.motiveId) ?? "?"}</div>
                <div>Место: {posById(table.place, caseFile.placeId) ?? "?"}</div>
                <div>Способ: {posById(table.method, caseFile.methodId) ?? "?"}</div>
              </div>
            );
          }

          return null;
        })()}

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
          <div key={p.playerId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, border: "1px solid #333", background: "#0f0f18" }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid #444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, opacity: 0.9 }}>
              {p.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <span>
                {p.name} {p.isHost ? "👑" : ""} {p.spectator ? "👀" : ""} {p.connected ? "⚡" : "💤"} {p.ready ? "✅" : ""}
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
