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

// Building kinds (12 total). Count per kind on server is (size + 3) => 6/7/8/9, total 90 tokens.
// Here we keep a clear animal-themed UI mapping.
const TOKEN_META: Record<string, { emoji: string; label: string }> = {
  dog_store: { emoji: "🐶", label: "Dog Store" },
  cat_store: { emoji: "🐱", label: "Cat Store" },
  vet_clinic: { emoji: "🩺", label: "Vet Clinic" },

  grooming: { emoji: "✂️", label: "Grooming" },
  aquarium: { emoji: "🐠", label: "Aquarium" },
  bird_shop: { emoji: "🦜", label: "Bird Shop" },

  pet_hotel: { emoji: "🏨", label: "Pet Hotel" },
  pet_food: { emoji: "🦴", label: "Pet Food" },
  toy_shop: { emoji: "🧸", label: "Toy Shop" },

  shelter: { emoji: "🏠", label: "Shelter" },
  exotic_pets: { emoji: "🦎", label: "Exotic Pets" },
  training: { emoji: "🦮", label: "Training" },
};

function tokenEmoji(kind?: string | null) {
  return TOKEN_META[String(kind || "")]?.emoji || "🏪";
}

function tokenLabel(kind?: string | null) {
  return TOKEN_META[String(kind || "")]?.label || String(kind || "Shop");
}

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
  { n: 10, x: -1, y: 3 }, { n: 11, x: 0, y: 3 }, { n: 12, x: 1, y: 3 },
  { n: 13, x: -1, y: 4 }, { n: 14, x: 0, y: 4 }, { n: 15, x: 1, y: 4 },
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


function sortTokens(toks: Array<{ id: string; kind: string; size: number }>) {
  return toks
    .slice()
    .sort((a, b) => (b.size - a.size) || String(a.kind).localeCompare(String(b.kind)) || String(a.id).localeCompare(String(b.id)));
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
  const [zoom, setZoom] = React.useState(1);
  // Pan (right mouse button drag)
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const rmbRef = React.useRef<null | { active: boolean; sx: number; sy: number; bx: number; by: number }>(null);
  // Refs to read latest values inside wheel handler (cursor-relative zoom updates both zoom + pan).
  const panRef = React.useRef(pan);
  const zoomRef = React.useRef(zoom);
  React.useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  React.useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const b = React.useMemo(() => bounds(CELLS), []);

  // Cell size in "native" board coordinates. Actual on-screen size is controlled by auto-fit scale.
  const S = 64;
  const G = 8;
  const PAD = 24;

  const nativeW = (b.maxX - b.minX + 1) * (S + G) - G + PAD * 2;
  const nativeH = (b.maxY - b.minY + 1) * (S + G) - G + PAD * 2;

  // Give the board more vertical room. We also allow scale > 1 (see calc below).
  const VIEW_H = 78; // vh

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
      // Let the board grow when there is space (up to a safe cap) so it doesn't look tiny on large screens.
      const scale = Math.min(1.35, sx, sy);
      setFit({ scale, boxW, boxH });
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [nativeW, nativeH]);

  const scaledW = nativeW * fit.scale;
  const scaledH = nativeH * fit.scale;
  const zScale = fit.scale * zoom;
  const zW = nativeW * zScale;
  const zH = nativeH * zScale;
  const tx = (fit.boxW - zW) / 2;
  const ty = (fit.boxH - zH) / 2;

  const onRmbDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 2) return; // right button
      e.preventDefault();
      e.stopPropagation();
      rmbRef.current = { active: true, sx: e.clientX, sy: e.clientY, bx: pan.x, by: pan.y };
    },
    [pan.x, pan.y]
  );

  const onRmbMove = React.useCallback((e: React.MouseEvent) => {
    const st = rmbRef.current;
    if (!st?.active) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - st.sx;
    const dy = e.clientY - st.sy;
    setPan({ x: st.bx + dx, y: st.by + dy });
  }, []);

  const endRmb = React.useCallback((e?: React.MouseEvent) => {
    const st = rmbRef.current;
    if (!st) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    rmbRef.current = { ...st, active: false };
  }, []);

  const tokenMeta = React.useCallback((kind?: string | null) => {
    const k = String(kind || "");
    return {
      emoji: tokenEmoji(k),
      label: tokenLabel(k),
    };
  }, []);

  const shortLabel = React.useCallback((s: string) => {
    const t = (s || "").trim();
    if (!t) return "";
    return t.length > 6 ? t.slice(0, 6) : t;
  }, []);

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          height: `min(${VIEW_H}vh, calc(100vh - 240px))`,
          width: "100%",
          position: "relative",
          overflow: "hidden",
          overscrollBehavior: "contain",
        }}
        onContextMenu={(e) => {
          // allow right-button drag without browser menu
          e.preventDefault();
        }}
        onMouseDown={onRmbDown}
        onMouseMove={onRmbMove}
        onMouseUp={endRmb}
        onMouseLeave={endRmb}
        onWheel={(e) => {
          // Local zoom only for the map (do not scale the whole UI)
          e.preventDefault();
          e.stopPropagation();
          // Zoom towards cursor (like maps/figma): keep the world point under cursor stable.
          const MIN_ZOOM = 0.6;
          const MAX_ZOOM = 2.6;
          const ZOOM_SPEED = 0.0015;

          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;

          const curZoom = zoomRef.current;
          const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, curZoom * Math.exp(-e.deltaY * ZOOM_SPEED)));
          if (Math.abs(nextZoom - curZoom) < 1e-6) return;

          // Current and next transforms
          const curZScale = fit.scale * curZoom;
          const nextZScale = fit.scale * nextZoom;
          const curTx = (fit.boxW - nativeW * curZScale) / 2;
          const curTy = (fit.boxH - nativeH * curZScale) / 2;
          const nextTx = (fit.boxW - nativeW * nextZScale) / 2;
          const nextTy = (fit.boxH - nativeH * nextZScale) / 2;

          const curPan = panRef.current;

          // World coordinates under cursor
          const wx = (cx - (curTx + curPan.x)) / curZScale;
          const wy = (cy - (curTy + curPan.y)) / curZScale;

          // New pan so that (wx,wy) stays under cursor
          const nextPan = {
            x: cx - nextTx - wx * nextZScale,
            y: cy - nextTy - wy * nextZScale,
          };

          setPan(nextPan);
          setZoom(nextZoom);
        }}
      >
        <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 5, display: "flex", gap: 8 }}>
          <button
            onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.1).toFixed(2))))}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.28)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.28)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            −
          </button>
        </div>
        <svg width="100%" height="100%" style={{ display: "block" }}>
          <g transform={`translate(${tx + pan.x}, ${ty + pan.y}) scale(${zScale})`}>
            {CELLS.map((c) => {
              const x = PAD + (c.x - b.minX) * (S + G);
              const y = PAD + (c.y - b.minY) * (S + G);
              const isSel = selected === c.n;

              const ownerId = owners ? (owners[c.n] ?? owners[String(c.n)]) : undefined;
              const owner = ownerId ? players.find((p) => p.playerId === ownerId) : undefined;
              const ownerFill = owner ? hexToRgba(colorForPlayer(owner), 0.55) : null;

              // Keep cell fill stable (owner color / base). Selection should be outline only.
              const fill = ownerFill ?? "#e9e9e9";
              const building = placed ? (placed[c.n] ?? placed[String(c.n)]) : null;
              return (
                <g
                  key={c.n}
                  onClick={() => {
                    setSelected((p) => (p === c.n ? null : c.n));
                    if (!isRunning || !socket) return;

                    // Build: click places selected token on your owned empty cell.
                    // Build phase is simultaneous (no turn), so do NOT gate on myTurn.
                    const myId = getPlayerId();
                    const isMine = ownerId && String(ownerId) === String(myId);
                    const isEmpty = !building;
                    if (phase === "build" && selectedTokenId && isMine && isEmpty) {
                      socket.emit(
                        "dogtown:buildPlace",
                        {
                          code,
                          playerId: myId,
                          cell: c.n,
                          tokenId: selectedTokenId,
                        },
                        (res: any) => {
                          if (res && res.ok) return;
                          // eslint-disable-next-line no-console
                          console.warn("buildPlace failed", res);
                        }
                      );
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
                  {isSel ? (
                    <rect
                      x={x}
                      y={y}
                      width={S}
                      height={S}
                      rx={8}
                      fill="none"
                      stroke="rgba(255,255,255,0.95)"
                      strokeWidth={4}
                    />
                  ) : null}
                  {!building ? (
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
                  ) : (
                    (() => {
                      const m = tokenMeta((building as any).kind);
                      return (
                        <>
                          {/* cell number (small) */}
                          <text
                            x={x + 10}
                            y={y + 14}
                            textAnchor="start"
                            dominantBaseline="middle"
                            fontSize={11}
                            fontWeight={900}
                            fill="#000"
                            opacity={0.85}
                          >
                            {c.n}
                          </text>

                          {/* size (top-right) */}
                          <text
                            x={x + S - 10}
                            y={y + 14}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fontSize={11}
                            fontWeight={900}
                            fill="#000"
                            opacity={0.9}
                          >
                            {String((building as any).size)}
                          </text>

                          {/* emoji */}
                          <text
                            x={x + S / 2}
                            y={y + S / 2 - 4}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={22}
                          >
                            {m.emoji}
                          </text>

                          {/* label */}
                          <text
                            x={x + S / 2}
                            y={y + S - 12}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={9}
                            fontWeight={900}
                            fill="#000"
                            opacity={0.85}
                          >
                            {m.label}
                          </text>
                        </>
                      );
                    })()
                  )}
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
  const myColor = me ? colorForPlayer(me as any) : "#ffffff";

  const [secret, setSecret] = React.useState<DogtownSecret>({});
  const [keepSel, setKeepSel] = React.useState<number[]>([]);
  const [selectedTokenId, setSelectedTokenId] = React.useState<string | null>(null);

  // Trade (session-based) local UI state
  const [tradeSessionId, setTradeSessionId] = React.useState<string | null>(null);
  const [tradeMyMoney, setTradeMyMoney] = React.useState<number>(0);
  const [tradeMyTokenIds, setTradeMyTokenIds] = React.useState<string[]>([]);
  const [tradeMyCellIds, setTradeMyCellIds] = React.useState<number[]>([]);

  const myId = getPlayerId();
  const keepNeed = keepCountFor(round, Math.max(3, Math.min(5, activePlayerIds.length || players.length || 4)));

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

  // Reset local selections when phase changes / new round dealt / game restarted.
  // Important: restart can keep (phase, round) the same, so we also key off the dealt deeds signature.
  const deedsSig = (secret?.deeds || []).join(",");
  React.useEffect(() => {
    if (phase === "deeds") {
      setKeepSel([]);
    }
    if (phase !== "build") {
      setSelectedTokenId(null);
    }
    if (phase !== "trade") {
      setTradeSessionId(null);
      setTradeMyMoney(0);
      setTradeMyTokenIds([]);
      setTradeMyCellIds([]);
    }
  }, [phase, round, deedsSig]);

  // Hard guard: never allow selecting more deeds than needed.
  React.useEffect(() => {
    if (keepSel.length > keepNeed) {
      setKeepSel((prev) => prev.slice(0, keepNeed));
    }
  }, [keepNeed, keepSel.length]);

  // Trade session: auto-pick an active session involving me (if any)
  React.useEffect(() => {
    if (phase !== "trade") return;
    const sessions = (view as any)?.tradeSessions || [];
    const mine = sessions.find((s: any) => s.a === myId || s.b === myId);
    if (mine) {
      if (tradeSessionId !== mine.id) {
        setTradeSessionId(mine.id);
        // sync local draft from snapshot
        const mySide = mine.a === myId ? mine.sideA : mine.sideB;
        setTradeMyMoney(Number(mySide?.money ?? 0) || 0);
        setTradeMyTokenIds(Array.isArray(mySide?.tokenIds) ? mySide.tokenIds : []);
        setTradeMyCellIds(Array.isArray(mySide?.cellIds) ? mySide.cellIds.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n)) : []);
      }
    } else {
      if (tradeSessionId) {
        setTradeSessionId(null);
        setTradeMyMoney(0);
        setTradeMyTokenIds([]);
        setTradeMyCellIds([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, (view as any)?.tradeSessions, myId]);

  // Trade: push updates only on explicit interactions (token toggle / +/- money).
  // This avoids spamming the server with timers/continuous sync and also prevents "ready" from being auto-cancelled.
  function getMyTradeSession(): any | null {
    if (phase !== "trade") return null;
    const sessions: any[] = (view as any)?.tradeSessions || [];
    const mine = tradeSessionId ? sessions.find((s) => s.id === tradeSessionId) : sessions.find((s) => s.a === myId || s.b === myId);
    return mine || null;
  }

  function sameTokenIds(a: string[] = [], b: string[] = []) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  function sameCellIds(a: number[] = [], b: number[] = []) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(Number).sort((x, y) => x - y);
    const sb = [...b].map(Number).sort((x, y) => x - y);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  function pushTradeUpdate(nextMoney: number, nextTokenIds: string[], nextCellIds: number[]) {
    if (!socket) return;
    if (isSpectator) return;

    const mine = getMyTradeSession();
    if (!mine) return;
    if (mine.status === "pending") return;

    const isA = mine.a === myId;
    const mySide = isA ? mine.sideA : mine.sideB;

    const curMoney = Number(mySide?.money ?? 0) || 0;
    const curIds: string[] = Array.isArray(mySide?.tokenIds) ? mySide.tokenIds : [];
    const curCells: number[] = Array.isArray(mySide?.cellIds) ? mySide.cellIds.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n)) : [];

    const moneyChanged = nextMoney !== curMoney;
    const tokensChanged = !sameTokenIds(nextTokenIds, curIds);
    const cellsChanged = !sameCellIds(nextCellIds, curCells);

    // If I was "ready" and I actually changed the offer, automatically снять готовность.
    if ((moneyChanged || tokensChanged || cellsChanged) && mySide?.committed) {
      socket.emit?.("dogtown:tradeCommit", { code, playerId: myId, sessionId: mine.id, committed: false });
    }

    if (moneyChanged || tokensChanged || cellsChanged) {
      socket.emit?.("dogtown:tradeUpdate", {
        code,
        playerId: myId,
        sessionId: mine.id,
        money: nextMoney,
        tokenIds: nextTokenIds,
        cellIds: nextCellIds,
      });
    }
  }

  const TRADE_MONEY_STEP = 10000;

  function tradeAddMoney(delta: number) {
    const max = typeof secret.money === "number" ? secret.money : undefined;
    const next = Math.max(0, Math.floor((tradeMyMoney || 0) + delta));
    const clamped = typeof max === "number" ? Math.min(max, next) : next;
    setTradeMyMoney(clamped);
    pushTradeUpdate(clamped, tradeMyTokenIds, tradeMyCellIds);
  }

  function tradeToggleToken(id: string) {
    const next = tradeMyTokenIds.includes(id) ? tradeMyTokenIds.filter((x) => x !== id) : [...tradeMyTokenIds, id];
    setTradeMyTokenIds(next);
    pushTradeUpdate(tradeMyMoney || 0, next, tradeMyCellIds);
  }

  function tradeToggleCell(cell: number) {
    const c = Number(cell);
    const next = tradeMyCellIds.includes(c) ? tradeMyCellIds.filter((x) => x !== c) : [...tradeMyCellIds, c];
    setTradeMyCellIds(next);
    pushTradeUpdate(tradeMyMoney || 0, tradeMyTokenIds, next);
  }


  const myBuildDone = !!buildDone[myId];
  // Back-compat variable name used throughout this file.
  const myTurn = !!isRunning && !isSpectator && phase === "build" && !myBuildDone;
  const didSubmitKeep = ((view as any)?.deedsKeepCounts?.[myId] ?? (gs as any)?.deedsKeepCounts?.[myId] ?? 0) === keepNeed;
  // Tokens are PUBLIC (so players can negotiate trades). Use public snapshot as source of truth.
  // This also fixes the case when a non-host re-enters the room and their `me:secret` wasn't re-sent yet.
  const myTokensRaw = (view?.tokensByPlayer?.[myId] ?? secret.tokens ?? []) as Array<{ id: string; kind: string; size: number }>;
  const myTokens = sortTokens(myTokensRaw);

  const myOwnedCells = React.useMemo(() => {
    const out: number[] = [];
    for (let c = 1; c <= 85; c++) {
      if ((owners as any)?.[c] === myId) out.push(c);
    }
    return out;
  }, [owners, myId]);

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
    // Use more of the viewport on large screens (less "unused" space around the board)
    <div style={{ width: "100%", height: "100%", padding: 10, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1920, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Dogtown</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Комната: <b>{code}</b> • Статус: <b>{isRunning ? "running" : "lobby"}</b>
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
          // Use 3 columns to better utilize wide screens: left controls, center board, right trade tokens.
          <div style={{ display: "grid", gridTemplateColumns: "360px 1fr 360px", gap: 14, alignItems: "start" }}>
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
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: myColor, boxShadow: "0 0 0 2px rgba(0,0,0,0.35)" }} />
                  Ваш цвет
                </div>
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
                              // Don't allow selecting more than needed.
                              if (prev.length >= keepNeed) return prev;
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
                  {(() => {
                    const sessions: any[] = (view as any)?.tradeSessions || [];
                    const mine = tradeSessionId ? sessions.find((s) => s.id === tradeSessionId) : sessions.find((s) => s.a === myId || s.b === myId);
                    const pendingIn = sessions.filter((s) => s.status === "pending" && s.b === myId);
                    const pendingOut = sessions.filter((s) => s.status === "pending" && s.a === myId);

                    const others = players.filter((p) => !p.spectator && p.playerId !== myId);

                    const myMoneyMax = typeof secret.money === "number" ? secret.money : undefined;

                    function playerName(pid: string) {
                      return players.find((p) => p.playerId === pid)?.name || pid.slice(0, 6);
                    }

                    if (mine) {
                      const isA = mine.a === myId;
                      const mySide = isA ? mine.sideA : mine.sideB;
                      const otherSide = isA ? mine.sideB : mine.sideA;
                      const otherId = isA ? mine.b : mine.a;
                      const otherTokens = ((view as any)?.tokensByPlayer?.[otherId] || []) as Array<{ id: string; kind: string; size: number }>;

                      // If I'm the receiver (B) and session is still pending, I must be able to accept/decline.
                      // Previously we always rendered the "mine" panel and showed only "waiting", so trades could never be accepted from UI.
                      const iAmReceiver = mine.b === myId;

                      return (
                        <div style={{ marginBottom: 10 }}>
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(0,0,0,0.25)",
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                              Сделка с <b>{playerName(otherId)}</b> {mine.status === "pending" ? "(ожидание ответа)" : ""}
                            </div>

                            {mine.status === "pending" ? (
                              iAmReceiver ? (
                                <>
                                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                                    <b>{playerName(otherId)}</b> предлагает начать сделку.
                                  </div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button
                                      onClick={() => socket?.emit?.("dogtown:tradeRespond", { code, playerId: myId, sessionId: mine.id, accept: true })}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 12,
                                        border: "1px solid rgba(255,255,255,0.14)",
                                        background: "rgba(34,197,94,0.35)",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                      }}
                                    >
                                      Принять
                                    </button>
                                    <button
                                      onClick={() => socket?.emit?.("dogtown:tradeRespond", { code, playerId: myId, sessionId: mine.id, accept: false })}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 12,
                                        border: "1px solid rgba(255,255,255,0.14)",
                                        background: "rgba(239,68,68,0.35)",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                      }}
                                    >
                                      Отклонить
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontSize: 12, opacity: 0.8 }}>Ждём принятия/отклонения.</div>
                              )
                            ) : (
                              <>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                  <div
                                    style={{
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: "rgba(255,255,255,0.04)",
                                      padding: 10,
                                    }}
                                  >
                                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}><b>Вы предлагаете</b></div>


                                    <div style={{ marginBottom: 10 }}>
                                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Деньги:</div>

                                      <div
                                        style={{
                                          width: "100%",
                                          boxSizing: "border-box",
                                          textAlign: "center",
                                          padding: "10px 10px",
                                          borderRadius: 12,
                                          border: "1px solid rgba(255,255,255,0.12)",
                                          background: "rgba(0,0,0,0.25)",
                                          color: "#fff",
                                          fontVariantNumeric: "tabular-nums",
                                          fontWeight: 900,
                                        }}
                                      >
                                        {moneyFmt(tradeMyMoney)}
                                      </div>

                                      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                                        <button
                                          style={{
                                            flex: 1,
                                            padding: "8px 10px",
                                            borderRadius: 10,
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#fff",
                                            cursor: isSpectator ? "not-allowed" : "pointer",
                                            opacity: isSpectator || tradeMyMoney <= 0 ? 0.6 : 1,
                                            fontWeight: 900,
                                          }}
                                          disabled={isSpectator || tradeMyMoney <= 0}
                                          onClick={() => tradeAddMoney(-TRADE_MONEY_STEP)}
                                        >
                                          −10k
                                        </button>

                                        <button
                                          style={{
                                            flex: 1,
                                            padding: "8px 10px",
                                            borderRadius: 10,
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#fff",
                                            cursor: isSpectator ? "not-allowed" : "pointer",
                                            opacity: isSpectator || (typeof myMoneyMax === "number" ? tradeMyMoney >= myMoneyMax : false) ? 0.6 : 1,
                                            fontWeight: 900,
                                          }}
                                          disabled={isSpectator || (typeof myMoneyMax === "number" ? tradeMyMoney >= myMoneyMax : false)}
                                          onClick={() => tradeAddMoney(TRADE_MONEY_STEP)}
                                        >
                                          +10k
                                        </button>
                                      </div>

                                      {typeof myMoneyMax === "number" ? (
                                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>макс. {moneyFmt(myMoneyMax)}</div>
                                      ) : null}
                                    </div>


                                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Жетоны:</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {myTokens.length ? (
                                        myTokens.map((t) => {
                                          const on = tradeMyTokenIds.includes(t.id);
                                          return (
                                            <button
                                              key={t.id}
                                              disabled={isSpectator}
                                              onClick={() => {
                                                if (isSpectator) return;
                                                tradeToggleToken(t.id);
                                              }}
                                              style={{
                                                fontSize: 12,
                                                padding: "4px 8px",
                                                borderRadius: 999,
                                                border: "1px solid rgba(255,255,255,0.10)",
                                                background: on ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                                                color: "#fff",
                                                cursor: isSpectator ? "not-allowed" : "pointer",
                                                opacity: isSpectator ? 0.6 : 1,
                                              }}
                                            >
                                              {tokenEmoji(t.kind)} {tokenLabel(t.kind)} • {t.size}
                                            </button>
                                          );
                                        })
                                      ) : (
                                        <span style={{ fontSize: 12, opacity: 0.65 }}>—</span>
                                      )}
                                    </div>

                                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10, marginBottom: 6 }}>Клетки:</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {myOwnedCells.length ? (
                                        myOwnedCells.map((c) => {
                                          const on = tradeMyCellIds.includes(c);
                                          const t: any = (placed as any)?.[c] || null;
                                          const label = t ? `${tokenEmoji(t.kind)} ${tokenLabel(t.kind)} • ${t.size}` : "пусто";
                                          return (
                                            <button
                                              key={c}
                                              disabled={isSpectator}
                                              onClick={() => {
                                                if (isSpectator) return;
                                                tradeToggleCell(c);
                                              }}
                                              style={{
                                                fontSize: 12,
                                                padding: "4px 8px",
                                                borderRadius: 999,
                                                border: "1px solid rgba(255,255,255,0.10)",
                                                background: on ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                                                color: "#fff",
                                                cursor: isSpectator ? "not-allowed" : "pointer",
                                                opacity: isSpectator ? 0.6 : 1,
                                                display: "inline-flex",
                                                gap: 6,
                                                alignItems: "center",
                                              }}
                                              title={label}
                                            >
                                              #{c}
                                              {t ? <span style={{ opacity: 0.85 }}>• {tokenEmoji(t.kind)} {t.size}</span> : <span style={{ opacity: 0.7 }}>• —</span>}
                                            </button>
                                          );
                                        })
                                      ) : (
                                        <span style={{ fontSize: 12, opacity: 0.65 }}>—</span>
                                      )}
                                    </div>

                                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                                      <button
                                        disabled={isSpectator}
                                        onClick={() => socket?.emit?.("dogtown:tradeCommit", { code, playerId: myId, sessionId: mine.id, committed: !mySide?.committed })}
                                        style={{
                                          padding: "8px 10px",
                                          borderRadius: 12,
                                          border: "1px solid rgba(255,255,255,0.14)",
                                          background: mySide?.committed ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.06)",
                                          color: "#fff",
                                          cursor: isSpectator ? "not-allowed" : "pointer",
                                          opacity: isSpectator ? 0.6 : 1,
                                          fontWeight: 900,
                                        }}
                                      >
                                        {mySide?.committed ? "Снять готовность" : "Готов"}
                                      </button>
                                      <button
                                        onClick={() => socket?.emit?.("dogtown:tradeCancelSession", { code, playerId: myId, sessionId: mine.id })}
                                        style={{
                                          padding: "8px 10px",
                                          borderRadius: 12,
                                          border: "1px solid rgba(255,255,255,0.14)",
                                          background: "rgba(239,68,68,0.35)",
                                          color: "#fff",
                                          cursor: "pointer",
                                          fontWeight: 900,
                                        }}
                                      >
                                        Отменить
                                      </button>
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: "rgba(255,255,255,0.04)",
                                      padding: 10,
                                    }}
                                  >
                                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                                      <b>{playerName(otherId)}</b> предлагает
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                                      Деньги: <b>{Number(otherSide?.money ?? 0) || 0}</b> {otherSide?.committed ? "✅" : ""}
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Жетоны:</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {(otherSide?.tokenIds || []).length ? (
                                        (otherSide.tokenIds as string[])
                                          .slice()
                                          .sort((a: string, b: string) => {
                                            const ta = otherTokens.find((x) => x.id === a);
                                            const tb = otherTokens.find((x) => x.id === b);
                                            return (
                                              (Number(tb?.size ?? 0) - Number(ta?.size ?? 0)) ||
                                              String(ta?.kind ?? "").localeCompare(String(tb?.kind ?? "")) ||
                                              String(a).localeCompare(String(b))
                                            );
                                          })
                                          .map((id: string) => {
                                            const t = otherTokens.find((x) => x.id === id);
                                            return (
                                              <span
                                                key={id}
                                                style={{
                                                  fontSize: 12,
                                                  padding: "4px 8px",
                                                  borderRadius: 999,
                                                  border: "1px solid rgba(255,255,255,0.10)",
                                                  background: "rgba(255,255,255,0.06)",
                                                  opacity: 0.95,
                                                }}
                                              >
                                                {t ? `${tokenEmoji(t.kind)} ${tokenLabel(t.kind)} • ${t.size}` : id.slice(0, 6)}
                                              </span>
                                            );
                                          })
                                      ) : (
                                        <span style={{ fontSize: 12, opacity: 0.65 }}>—</span>
                                      )}
                                    </div>

                                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10, marginBottom: 6 }}>Клетки:</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {(otherSide?.cellIds || []).length ? (
                                        (otherSide.cellIds as number[])
                                          .slice()
                                          .map((n: any) => Number(n))
                                          .filter((n: any) => Number.isFinite(n))
                                          .sort((a: number, b: number) => a - b)
                                          .map((c: number) => {
                                            const t: any = (placed as any)?.[c] || null;
                                            const label = t ? `${tokenEmoji(t.kind)} ${tokenLabel(t.kind)} • ${t.size}` : "пусто";
                                            return (
                                              <span
                                                key={c}
                                                title={label}
                                                style={{
                                                  fontSize: 12,
                                                  padding: "4px 8px",
                                                  borderRadius: 999,
                                                  border: "1px solid rgba(255,255,255,0.10)",
                                                  background: "rgba(255,255,255,0.06)",
                                                  opacity: 0.95,
                                                }}
                                              >
                                                #{c}{t ? ` • ${tokenEmoji(t.kind)} ${t.size}` : ""}
                                              </span>
                                            );
                                          })
                                      ) : (
                                        <span style={{ fontSize: 12, opacity: 0.65 }}>—</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                  Когда <b>оба</b> нажмут <b>Готов</b>, сделка применится автоматически.
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div style={{ marginBottom: 10 }}>
                        {pendingIn.length ? (
                          <div style={{ marginBottom: 10 }}>
                            {pendingIn.map((s) => (
                              <div
                                key={s.id}
                                style={{
                                  padding: 12,
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(0,0,0,0.25)",
                                  marginBottom: 8,
                                }}
                              >
                                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                                  Запрос сделки от <b>{playerName(s.a)}</b>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    onClick={() => socket?.emit?.("dogtown:tradeRespond", { code, playerId: myId, sessionId: s.id, accept: true })}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.14)",
                                      background: "rgba(34,197,94,0.35)",
                                      color: "#fff",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                    }}
                                  >
                                    Принять
                                  </button>
                                  <button
                                    onClick={() => socket?.emit?.("dogtown:tradeRespond", { code, playerId: myId, sessionId: s.id, accept: false })}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.14)",
                                      background: "rgba(239,68,68,0.35)",
                                      color: "#fff",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                    }}
                                  >
                                    Отклонить
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {pendingOut.length ? (
                          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                            Вы отправили запрос сделки: {pendingOut.map((s) => playerName(s.b)).join(", ")}
                          </div>
                        ) : null}

                        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
                          Выберите игрока и отправьте запрос — после принятия откроется панель обмена.
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {others.map((p) => {
                            const pc = colorForPlayer(p as any);
                            return (
                              <button
                                key={p.playerId}
                                disabled={isSpectator}
                                onClick={() =>
                                  socket?.emit?.("dogtown:tradeRequest", { code, playerId: myId, to: p.playerId }, (res: any) => {
                                    if (res?.ok && res.sessionId) setTradeSessionId(res.sessionId);
                                  })
                                }
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 12,
                                  border: `1px solid ${hexToRgba(pc, 0.55)}`,
                                  background: hexToRgba(pc, 0.18),
                                  color: "#fff",
                                  cursor: isSpectator ? "not-allowed" : "pointer",
                                  opacity: isSpectator ? 0.6 : 1,
                                  fontWeight: 900,
                                }}
                              >
                                Предложить {p.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

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
                            <span style={{ fontSize: 16, lineHeight: 1 }}>{tokenEmoji(t.kind)}</span>
                            <span style={{ opacity: 0.9 }}>{tokenLabel(t.kind)}</span>
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

            {/* Right panel: visible-to-all tokens for trading */}
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                padding: 12,
                maxHeight: "calc(100vh - 150px)",
                overflow: "auto",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 10 }}>Жетоны игроков (для торговли)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {players
                  .filter((p) => !p.spectator)
                  .map((p) => {
                    const toksRaw = (view as any)?.tokensByPlayer?.[p.playerId] ?? [];
                    // UX: stable readable sorting (bigger first, then by kind)
                    const toks = [...toksRaw].sort((a: any, b: any) => {
                      const sa = Number(a?.size ?? 0);
                      const sb = Number(b?.size ?? 0);
                      if (sb !== sa) return sb - sa;
                      const ka = String(a?.kind ?? "");
                      const kb = String(b?.kind ?? "");
                      return ka.localeCompare(kb);
                    });
                    const pc = colorForPlayer(p);
                    return (
                      <div
                        key={p.playerId}
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.22)",
                          padding: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: pc, boxShadow: "0 0 0 2px rgba(0,0,0,0.35)" }} />
                            <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.95 }}>{p.name}{p.isHost ? " 👑" : ""}</div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>{toks.length ? `${toks.length} шт.` : "—"}</div>
                        </div>

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
                                <span style={{ opacity: 0.95 }}>{tokenEmoji(t.kind)}</span>
                                <span style={{ opacity: 0.9 }}>{tokenLabel(t.kind)}</span>
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
          </div>
        )}
      </div>
    </div>
  );
}
