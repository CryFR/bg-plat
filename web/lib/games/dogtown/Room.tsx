"use client";

import React from "react";
import type { Player, RoomSnapshot } from "../../platform/types";
import { getPlayerId } from "../../player";

type Props = {
  code: string;
  // injected from GamePage -> GameRoom
  snap?: RoomSnapshot | null;
  socket?: any;
};

type DogtownPublic = {
  phase?: "deeds" | "tiles" | "trade" | "build" | "income" | "end";
  round?: number;
  firstPlayerId?: string | null;
  buildDone?: Record<string, boolean>;
  owners?: Record<string | number, string>;
  placed?: Record<string | number, { id: string; kind: string; size: number } | null>;
  tokenCounts?: Record<string, number>;
  tokensByPlayer?: Record<string, Array<{ id: string; kind: string; size: number }>>;
  deedsKeepCounts?: Record<string, number>;
  log?: string[];
};

type DogtownSecret = {
  money?: number;
  deeds?: number[];
  deedsKeep?: number[];
  tokens?: Array<{ id: string; kind: string; size: number }>;
};

const DEAL_KEEP: Record<3 | 4 | 5, Array<[deal: number, keep: number]>> = {
  3: [
    [7, 5],
    [6, 4],
    [6, 4],
    [6, 4],
    [6, 4],
    [6, 4],
  ],
  4: [
    [6, 4],
    [5, 3],
    [5, 3],
    [5, 3],
    [5, 3],
    [5, 3],
  ],
  5: [
    [5, 3],
    [5, 3],
    [5, 3],
    [4, 2],
    [4, 2],
    [4, 2],
  ],
};

function clampPlayersCount(n: number): 3 | 4 | 5 {
  if (n <= 3) return 3;
  if (n === 4) return 4;
  return 5;
}

function keepCountFor(round: number, playerCount: number): number {
  const pc = clampPlayersCount(playerCount);
  const idx = Math.max(0, Math.min(5, (round || 1) - 1));
  return DEAL_KEEP[pc][idx][1];
}

function phaseLabel(phase?: DogtownPublic["phase"]) {
  switch (phase) {
    case "deeds":
      return "Участки";
    case "tiles":
      return "Жетоны";
    case "trade":
      return "Торговля";
    case "build":
      return "Стройка";
    case "income":
      return "Доход";
    case "end":
      return "Финал";
    default:
      return "…";
  }
}

function moneyFmt(x?: number) {
  const v = typeof x === "number" ? x : 0;
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

type Cell = { n: number; x: number; y: number };

function withOffset(cells: Cell[], ox: number, oy: number): Cell[] {
  return cells.map((c) => ({ ...c, x: c.x + ox, y: c.y + oy }));
}

// --- Shapes ---
const A: Cell[] = [
  { n: 1, x: 0, y: 0 }, { n: 2, x: 1, y: 0 },
  { n: 3, x: 0, y: 1 }, { n: 4, x: 1, y: 1 }, { n: 5, x: 2, y: 1 },
  { n: 6, x: -1, y: 2 }, { n: 7, x: 0, y: 2 }, { n: 8, x: 1, y: 2 }, { n: 9, x: 2, y: 2 },
  { n: 10, x: 0, y: 3 }, { n: 11, x: 1, y: 3 }, { n: 12, x: 2, y: 3 },
  { n: 13, x: 0, y: 4 }, { n: 14, x: 1, y: 4 }, { n: 15, x: 2, y: 4 },
];

const B: Cell[] = [
  { n: 16, x: 0, y: 0 }, { n: 17, x: 1, y: 0 }, { n: 18, x: 2, y: 0 },
  { n: 19, x: 0, y: 1 }, { n: 20, x: 1, y: 1 }, { n: 21, x: 2, y: 1 },
  { n: 22, x: 0, y: 2 }, { n: 23, x: 1, y: 2 },
  { n: 24, x: 0, y: 3 }, { n: 25, x: 1, y: 3 },
  { n: 26, x: 0, y: 4 }, { n: 27, x: 1, y: 4 },
];

const C: Cell[] = [
  { n: 28, x: 0, y: 0 }, { n: 29, x: 1, y: 0 }, { n: 30, x: 2, y: 0 },
  { n: 31, x: 0, y: 1 }, { n: 32, x: 1, y: 1 }, { n: 33, x: 2, y: 1 },
  { n: 34, x: 0, y: 2 }, { n: 35, x: 1, y: 2 }, { n: 36, x: 2, y: 2 },
  { n: 37, x: 1, y: 3 }, { n: 38, x: 2, y: 3 }, { n: 39, x: 3, y: 3 },
  { n: 40, x: 1, y: 4 }, { n: 41, x: 2, y: 4 }, { n: 42, x: 3, y: 4 },
];

const D: Cell[] = [
  { n: 43, x: 0, y: 0 }, { n: 44, x: 1, y: 0 }, { n: 45, x: 2, y: 0 }, { n: 46, x: 3, y: 0 },
  { n: 47, x: 0, y: 1 }, { n: 48, x: 1, y: 1 }, { n: 49, x: 2, y: 1 }, { n: 50, x: 3, y: 1 },
  { n: 51, x: 0, y: 2 }, { n: 52, x: 1, y: 2 }, { n: 53, x: 2, y: 2 }, { n: 54, x: 3, y: 2 },
  { n: 55, x: 2, y: 3 }, { n: 56, x: 3, y: 3 },
  { n: 57, x: 2, y: 4 }, { n: 58, x: 3, y: 4 },
];

const E: Cell[] = [
  { n: 59, x: 0, y: 0 }, { n: 60, x: 1, y: 0 },
  { n: 61, x: 0, y: 1 }, { n: 62, x: 1, y: 1 },
  { n: 63, x: 0, y: 2 }, { n: 64, x: 1, y: 2 }, { n: 65, x: 2, y: 2 },
  { n: 66, x: 0, y: 3 }, { n: 67, x: 1, y: 3 }, { n: 68, x: 2, y: 3 },
  { n: 69, x: 1, y: 4 }, { n: 70, x: 2, y: 4 },
];

const F: Cell[] = [
  { n: 71, x: 0, y: 0 }, { n: 72, x: 1, y: 0 }, { n: 73, x: 2, y: 0 }, { n: 74, x: 3, y: 0 },
  { n: 75, x: 0, y: 1 }, { n: 76, x: 1, y: 1 }, { n: 77, x: 2, y: 1 }, { n: 78, x: 3, y: 1 },
  { n: 79, x: 0, y: 2 }, { n: 80, x: 1, y: 2 }, { n: 81, x: 2, y: 2 }, { n: 82, x: 3, y: 2 },
  { n: 83, x: 0, y: 3 }, { n: 84, x: 1, y: 3 }, { n: 85, x: 2, y: 3 },
];

// компактные оффсеты
const CELLS: Cell[] = [
  ...withOffset(A, 0, 0),
  ...withOffset(B, 4, 0),
  ...withOffset(C, 8, 0),
  ...withOffset(D, 12, 0),
  ...withOffset(E, 5, 6),
  ...withOffset(F, 10, 6),
];

function bounds(cells: Cell[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { minX, minY, maxX, maxY };
}

// --- Player colors (client fallback) ---
// Fallback palette (should match server's high-contrast palette).
// Used only if player.color is missing for some reason.
const COLOR_PALETTE = [
  "#E6194B", // red
  "#3CB44B", // green
  "#4363D8", // blue
  "#F58231", // orange
  "#911EB4", // purple
  "#46F0F0", // cyan
  "#F032E6", // magenta
  "#BCF60C", // lime
  "#FABEBE", // pink
  "#008080", // teal
  "#FFD8B1", // peach
  "#000000", // black
];

function colorForPlayer(p: any): string {
  if (p?.color && typeof p.color === "string") return p.color;
  const id: string = String(p?.playerId || "");
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return `rgba(255,255,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function PlayersLegend({ players }: { players: Player[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {players.map((p) => (
        <div
          key={p.playerId}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            opacity: p.connected ? 1 : 0.55,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: colorForPlayer(p),
              boxShadow: "0 0 0 2px rgba(0,0,0,0.35)",
              flex: "0 0 auto",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}{p.isHost ? " 👑" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function DogtownBoard({
  code,
  socket,
  players,
  isRunning,
  phase,
  myTurn,
  selectedTokenId,
  owners,
  placed,
}: {
  code: string;
  socket?: any;
  players: Player[];
  isRunning: boolean;
  phase?: DogtownPublic["phase"];
  myTurn: boolean;
  selectedTokenId: string | null;
  owners: Record<string | number, string> | undefined;
  placed?: DogtownPublic["placed"];
}) {
  const [selected, setSelected] = React.useState<number | null>(null);
  const b = React.useMemo(() => bounds(CELLS), []);

  const S = 64;
  const G = 8;
  const PAD = 24;

  const nativeW = (b.maxX - b.minX + 1) * (S + G) - G + PAD * 2;
  const nativeH = (b.maxY - b.minY + 1) * (S + G) - G + PAD * 2;

  const VIEW_H = 70; // vh

  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = React.useState({ scale: 1, boxW: 900, boxH: 600 });

  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const calc = () => {
      const boxW = el.clientWidth;
      const boxH = el.clientHeight;
      const sx = boxW / nativeW;
      const sy = boxH / nativeH;
      const scale = Math.min(1, sx, sy);
      setFit({ scale, boxW, boxH });
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [nativeW, nativeH]);

  const scaledW = nativeW * fit.scale;
  const scaledH = nativeH * fit.scale;
  const tx = (fit.boxW - scaledW) / 2;
  const ty = (fit.boxH - scaledH) / 2;

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          height: `${VIEW_H}vh`,
          width: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <svg width="100%" height="100%" style={{ display: "block" }}>
          <g transform={`translate(${tx}, ${ty}) scale(${fit.scale})`}>
            {CELLS.map((c) => {
              const x = PAD + (c.x - b.minX) * (S + G);
              const y = PAD + (c.y - b.minY) * (S + G);
              const isSel = selected === c.n;

              const ownerId = owners ? (owners[c.n] ?? owners[String(c.n)]) : undefined;
              const owner = ownerId ? players.find((p) => p.playerId === ownerId) : undefined;
              const ownerFill = owner ? hexToRgba(colorForPlayer(owner), 0.55) : null;

              const fill = isSel ? "#ffffff" : ownerFill ?? "#e9e9e9";
              const building = placed ? (placed[c.n] ?? placed[String(c.n)]) : null;
              return (
                <g
                  key={c.n}
                  onClick={() => {
                    setSelected((p) => (p === c.n ? null : c.n));
                    if (!isRunning || !socket) return;

                    // Build: click places selected token on your owned empty cell.
                    if (phase === "build" && myTurn && selectedTokenId) {
                      socket.emit("dogtown:buildPlace", {
                        code,
                        playerId: getPlayerId(),
                        cell: c.n,
                        tokenId: selectedTokenId,
                      });
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={S}
                    height={S}
                    rx={8}
                    strokeWidth={4}
                    stroke="#000000"
                    fill={fill}
                  />
                  <text
                    x={x + S / 2}
                    y={y + S / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={20}
                    fontWeight={700}
                    fill="#000000"
                  >
                    {c.n}
                  </text>

                  {building ? (
                    <text
                      x={x + S - 10}
                      y={y + 14}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={12}
                      fontWeight={900}
                      fill="#000"
                    >
                      {String(building.size)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

export default function DogtownRoom({ code, snap, socket }: Props) {
  const st = (snap as any)?.game?.status as string | undefined;

  // Prefer publicState (what server intends clients to use). Fallback to state for older snapshots/debug.
  const gp = (snap as any)?.game?.publicState as DogtownPublic | undefined;
  const gs = (snap as any)?.game?.state as DogtownPublic | undefined;
  const view = gp ?? gs;

  const owners = (view?.owners ?? gs?.owners) as Record<string | number, string> | undefined;
  const placed = view?.placed ?? gs?.placed;
  const phase = view?.phase;
  const round = view?.round ?? 1;
  const activePlayerIds = Object.keys(view?.tokenCounts || {});
  const buildDone = view?.buildDone ?? {};

  const players = ((snap as any)?.players || []) as Player[];
  const me = players.find((p) => p.playerId === getPlayerId());
  const isHost = !!me?.isHost;
  const isSpectator = !!(me as any)?.spectator;
  const isRunning = st === "running";

  const [secret, setSecret] = React.useState<DogtownSecret>({});
  const [keepSel, setKeepSel] = React.useState<number[]>([]);
  const [selectedTokenId, setSelectedTokenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!socket) return;
    const onSecret = (m: any) => {
      setSecret({
        money: typeof m?.money === "number" ? m.money : undefined,
        deeds: Array.isArray(m?.deeds) ? m.deeds : undefined,
        deedsKeep: Array.isArray(m?.deedsKeep) ? m.deedsKeep : undefined,
        tokens: Array.isArray(m?.tokens) ? m.tokens : undefined,
      });
    };
    socket.on("me:secret", onSecret);
    return () => {
      socket.off("me:secret", onSecret);
    };
  }, [socket]);

  // Reset local selections when phase changes
  React.useEffect(() => {
    if (phase === "deeds") {
      setKeepSel([]);
    }
    if (phase !== "build") {
      setSelectedTokenId(null);
    }
  }, [phase, round]);

  const myId = getPlayerId();
  const myBuildDone = !!buildDone[myId];
  // Back-compat variable name used throughout this file.
  const myTurn = !!isRunning && !isSpectator && phase === "build" && !myBuildDone;
  const keepNeed = keepCountFor(round, Math.max(3, Math.min(5, activePlayerIds.length || players.length || 4)));
  const didSubmitKeep = (gs?.deedsKeepCounts?.[myId] ?? 0) === keepNeed;
  const myTokens = secret.tokens || [];

  function fmtMoney(n?: number) {
    if (typeof n !== "number") return "—";
    return n.toLocaleString("ru-RU");
  }

  if (!snap) {
    return <div style={{ padding: 24, opacity: 0.8 }}>Захожу в Dogtown…</div>;
  }

  const minPlayers = 1;
  const canStart = isHost && players.length >= minPlayers;

  return (
    <div style={{ width: "100%", height: "100%", padding: 16, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Dogtown</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Комната: <b>{code}</b> • Статус: <b>{isRunning ? "running" : "lobby"}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => (window.location.href = `/room/${code}`)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Назад в комнату
            </button>

            {isHost ? (
              <button
                disabled={!canStart}
                onClick={() => {
                  if (isRunning) {
                    const ok = window.confirm("Рестартнуть игру? Текущий прогресс будет потерян.");
                    if (!ok) return;
                  }
                  socket?.emit?.("room:startGame", { code, byPlayerId: getPlayerId() });
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: canStart ? (isRunning ? "#ef4444" : "#16a34a") : "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: canStart ? "pointer" : "not-allowed",
                  opacity: canStart ? 1 : 0.6,
                  fontWeight: 900,
                }}
              >
                {isRunning ? "Restart" : "Start"}
              </button>
            ) : null}

            {!isHost ? (
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {isRunning ? "Игра уже запущена (Start/Restart только у хоста)" : "Start доступен только хосту"}
              </div>

            ) : (
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {players.length < minPlayers ? `Нужно ${minPlayers}+ игроков` : ""}
              </div>
            )}
          </div>

        </div>

        <div style={{ marginBottom: 12 }}>
          <PlayersLegend players={players} />
        </div>

        {!isRunning ? (
          <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "start" }}>
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Игроки</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {players.map((p) => (
                  <div
                    key={p.playerId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.25)",
                      opacity: p.connected ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: colorForPlayer(p), boxShadow: "0 0 0 2px rgba(0,0,0,0.35)" }} />
                      <div>
                        <div style={{ fontWeight: 800 }}>{p.name} {p.isHost ? "👑" : ""}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{p.connected ? "online" : "offline"}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>{p.ready ? "✅" : "…"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 10, opacity: 0.75 }}>
                Lobby Dogtown: тут будут правила/подсказки/настройки. Пока — превью карты.
              </div>
              <DogtownBoard
                code={code}
                socket={socket}
                players={players}
                isRunning={false}
                phase={phase}
                myTurn={false}
                selectedTokenId={null}
                owners={owners}
                placed={placed}
              />
            </div>
          </div>
        ) : (
          // running
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  Раунд {round}/6 • {phaseLabel(phase)}
                </div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {phase === "build" ? (
                    (() => {
                      const total = players.filter((p) => !p.spectator).length || Object.keys(buildDone).length;
                      const done = Object.values(buildDone).filter(Boolean).length;
                      return (
                        <span>
                          Стройка: <b>{done}/{total}</b> готовы{myBuildDone ? " (вы готовы)" : ""}
                        </span>
                      );
                    })()
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.25)",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  Ваши деньги: {fmtMoney(secret.money)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  (деньги скрыты от других)
                </div>
              </div>

              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.20)",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Жетоны игроков (для торговли)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {players
                    .filter((p) => !p.spectator)
                    .map((p) => {
                      const toks = view?.tokensByPlayer?.[p.playerId] ?? [];
                      return (
                        <div key={p.playerId} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ minWidth: 110, fontSize: 13, fontWeight: 800, opacity: 0.95 }}>{p.name}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {toks.length === 0 ? (
                              <span style={{ fontSize: 12, opacity: 0.65 }}>—</span>
                            ) : (
                              toks.map((t) => (
                                <span
                                  key={t.id}
                                  style={{
                                    fontSize: 12,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(255,255,255,0.10)",
                                    background: "rgba(255,255,255,0.06)",
                                    opacity: 0.95,
                                    display: "inline-flex",
                                    gap: 6,
                                    alignItems: "center",
                                  }}
                                >
                                  <span style={{ opacity: 0.9 }}>{t.kind}</span>
                                  <span style={{ opacity: 0.8 }}>• {t.size}</span>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {isSpectator ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.25)",
                    fontSize: 13,
                    opacity: 0.9,
                    lineHeight: 1.35,
                  }}
                >
                  <b>Вы зритель.</b> Вы зашли после старта игры, поэтому карты/деньги/жетоны вам не раздаются.
                  <div style={{ marginTop: 6, opacity: 0.8 }}>
                    Решение: хост нажимает <b>Restart</b> или вы заходите до старта.
                  </div>
                </div>
              ) : null}

              {/* Phase panels */}
              {phase === "deeds" ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Выберите участки (оставить {keepNeed})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {(secret.deeds || []).map((n) => {
                      const on = keepSel.includes(n);
                      return (
                        <button
                          key={n}
                          disabled={isSpectator || didSubmitKeep}
                          onClick={() => {
                            if (isSpectator || didSubmitKeep) return;
                            setKeepSel((prev) => {
                              if (prev.includes(n)) return prev.filter((x) => x !== n);
                              return [...prev, n];
                            });
                          }}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: on ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                            color: "#fff",
                            cursor: isSpectator || didSubmitKeep ? "not-allowed" : "pointer",
                            opacity: isSpectator || didSubmitKeep ? 0.6 : 1,
                            fontWeight: 900,
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      disabled={isSpectator || didSubmitKeep || keepSel.length !== keepNeed}
                      onClick={() => {
                        socket?.emit?.("dogtown:deedsKeep", { code, playerId: myId, keep: keepSel });
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: !didSubmitKeep && keepSel.length === keepNeed ? "#2563eb" : "rgba(255,255,255,0.06)",
                        color: "#fff",
                        cursor: !didSubmitKeep && keepSel.length === keepNeed ? "pointer" : "not-allowed",
                        opacity: !didSubmitKeep && keepSel.length === keepNeed ? 1 : 0.6,
                        fontWeight: 900,
                      }}
                    >
                      Подтвердить ({keepSel.length}/{keepNeed})
                    </button>
                    {didSubmitKeep ? <div style={{ fontSize: 13, opacity: 0.8 }}>Ждём остальных…</div> : null}
                  </div>
                </div>
              ) : null}

              {phase === "trade" ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Торговля</div>
                  <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
                    Договаривайтесь как угодно (голос/чат). Система сделок будет позже — сейчас просто переход фазы.
                  </div>
                  <button
                    disabled={!isHost}
                    onClick={() => socket?.emit?.("dogtown:endTrade", { code })}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: isHost ? "#16a34a" : "rgba(255,255,255,0.06)",
                      color: "#fff",
                      cursor: isHost ? "pointer" : "not-allowed",
                      opacity: isHost ? 1 : 0.6,
                      fontWeight: 900,
                    }}
                  >
                    Закончить торговлю
                  </button>
                  {!isHost ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>Фазу завершает хост.</div> : null}
                </div>
              ) : null}

              {phase === "build" ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Строительство</div>
                  <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
                    Выберите жетон, затем кликните по своей пустой клетке на поле.
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {myTokens.length === 0 ? (
                      <div style={{ fontSize: 13, opacity: 0.75 }}>Жетонов нет.</div>
                    ) : (
                      myTokens.map((t) => {
                        const on = selectedTokenId === t.id;
                        return (
                          <button
                            key={t.id}
                            disabled={isSpectator}
                            onClick={() => {
                              if (isSpectator) return;
                              setSelectedTokenId((p) => (p === t.id ? null : t.id));
                            }}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: on ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                              color: "#fff",
                              cursor: isSpectator ? "not-allowed" : "pointer",
                              opacity: isSpectator ? 0.6 : 1,
                              fontWeight: 900,
                              display: "inline-flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span style={{ opacity: 0.9 }}>{t.kind}</span>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "rgba(0,0,0,0.25)",
                                border: "1px solid rgba(255,255,255,0.10)",
                                fontSize: 12,
                              }}
                            >
                              {t.size}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      disabled={isSpectator || myBuildDone}
                      onClick={() => socket?.emit?.("dogtown:buildDone", { code, playerId: myId })}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: !myBuildDone ? "#2563eb" : "rgba(255,255,255,0.06)",
                        color: "#fff",
                        cursor: !myBuildDone ? "pointer" : "not-allowed",
                        opacity: !myBuildDone ? 1 : 0.6,
                        fontWeight: 900,
                      }}
                    >
                      Закончить строительство
                    </button>
                    {myBuildDone ? <div style={{ fontSize: 13, opacity: 0.75 }}>Вы уже отметились как готовый.</div> : null}
                  </div>
                </div>
              ) : null}

              {phase === "tiles" || phase === "income" ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {phase === "tiles" ? "Раздаём жетоны…" : "Считаем доход…"}
                </div>
              ) : null}

              {phase === "end" ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Игра окончена</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    Ваш результат: <b>{fmtMoney(secret.money)}</b>
                  </div>
                </div>
              ) : null}

              {Array.isArray(view?.log) && view!.log!.length ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85, marginBottom: 6 }}>Лог</div>
                  <div
                    style={{
                      maxHeight: 160,
                      overflow: "auto",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(0,0,0,0.25)",
                      padding: 10,
                      fontSize: 12,
                      opacity: 0.85,
                      lineHeight: 1.35,
                    }}
                  >
                    {view!.log!.slice().reverse().map((l, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>{l}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <DogtownBoard
                code={code}
                socket={socket}
                players={players}
                isRunning={true}
                phase={phase}
                myTurn={myTurn}
                selectedTokenId={selectedTokenId}
                owners={owners}
                placed={placed}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
