"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPlayerId, getSavedName, saveName } from "../../../lib/player";
import { useRoom } from "../../../lib/platform/useRoom";
import type { Player } from "../../../lib/platform/types";

// IMPORTANT: use server-assigned colors so lobby and in-game colors match.
// Keep a fallback palette for backward-compat (old snapshots without color).
const PLAYER_COLORS = [
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

function colorForPlayer(p: Player | undefined) {
  if (p?.color && typeof p.color === "string") return p.color;
  const playerId = p?.playerId;
  if (!playerId) return "#9ca3af";
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export default function RoomPage() {
  const router = useRouter();
  const { code } = useParams() as any;

  const { socket, snap, kicked } = useRoom(String(code));

  const [name, setName] = useState(getSavedName("Player"));

  useEffect(() => {
    // Keep local storage sane even if user pastes a long string.
    const fixed = (name ?? "").trim().slice(0, 12) || "Player";
    saveName(fixed);
  }, [name]);

  // If room has game id -> render game room UI right here (single URL),
  // OR if you prefer separate URL per game (more stable deep-link):
  useEffect(() => {
    const gid = (snap as any)?.game?.id as string | undefined;
    const st = (snap as any)?.game?.status as string | undefined;
    // Redirect to game page only when the game is actually running.
    if (gid && st === "running") {
      router.replace(`/room/${code}/game/${gid}`);
    }
  }, [snap, router, code]);

  if (kicked) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Тебя кикнули</h2>
        <div style={{ opacity: 0.8 }}>{kicked}</div>
      </div>
    );
  }

  if (!snap) {
    return <div style={{ padding: 24, opacity: 0.8 }}>Захожу в комнату…</div>;
  }

  const players = (snap.players || []) as Player[];
  const playerId = getPlayerId();
  const me = players.find((p) => p.playerId === playerId);
  const gameId = (snap as any)?.game?.id as string | undefined;
  const gameStatus = (snap as any)?.game?.status as string | undefined;
  const minPlayers = gameId === "dogtown" ? 1 : 4;

  const isReady = !!me?.ready;
  const canRename = !isReady;
  const currentServerName = me?.name ?? "";

  function commitName() {
    const next = (name ?? "").trim().slice(0, 12) || "Player";
    setName(next);
    saveName(next);
    socket.emit("room:rename", { code: snap.code, playerId, name: next });
  }

  function setReady(ready: boolean) {
    socket.emit("room:ready", { code: snap.code, playerId, ready });
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Комната: {snap.code}</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Игроков: {players.length} • Игра: {(snap as any)?.game?.id || "—"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={name}
                  maxLength={12}
                  onChange={(e) => setName(e.target.value.slice(0, 12))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canRename) commitName();
                  }}
                  placeholder="Ник"
                  disabled={!canRename}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: canRename ? "#121220" : "#0f0f18",
                    color: "#eee",
                    opacity: canRename ? 1 : 0.65,
                    cursor: canRename ? "text" : "not-allowed",
                    minWidth: 220,
                  }}
                  title={!canRename ? "Ник нельзя менять после Ready" : ""}
                />
                <button
                  disabled={!canRename || (name.trim() || "Player") === (currentServerName || "Player")}
                  onClick={commitName}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: canRename ? "#2b2b3a" : "#1a1a24",
                    color: "#fff",
                    cursor: canRename ? "pointer" : "not-allowed",
                    opacity: canRename ? 1 : 0.6,
                    whiteSpace: "nowrap",
                  }}
                  title={!canRename ? "Сними Ready, чтобы сменить ник" : "Сохранить ник"}
                >
                  Сменить ник
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setReady(!(me?.ready))}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              background: me?.ready ? "#1d5d3a" : "#2b2b3a",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {me?.ready ? "Готов ✅" : "Готов?"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #2a2a3a", background: "#10101a", padding: 16, borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Игроки</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {players.map((p) => (
              <div
                key={p.playerId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#0d0d16",
                  border: "1px solid #232338",
                  opacity: p.connected ? 1 : 0.55,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: colorForPlayer(p),
                        border: "1px solid rgba(255,255,255,0.35)",
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                        flex: "0 0 auto",
                      }}
                      title="Цвет игрока"
                    />
                    <span>
                      {p.name} {p.isHost ? "👑" : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {p.playerId.slice(0, 10)}… • {p.connected ? "online" : "offline"}
                  </div>
                </div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>{p.ready ? "✅" : "…"}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: "1px solid #2a2a3a", background: "#10101a", padding: 16, borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Лобби</h3>
          <div style={{ opacity: 0.75, marginBottom: 12 }}>
            Эта страница — общий “комнатный” контейнер. Конкретная игра рендерится по <code>gameId</code>.
          </div>
          {!gameId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 12, border: "1px dashed #333", opacity: 0.85 }}>
                Игра пока не выбрана.
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  disabled={!me?.isHost}
                  onClick={() => {
                    socket.emit("room:setGame", { code: snap.code, byPlayerId: playerId, gameId: "ghost-letters" });
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    background: me?.isHost ? "#1d4ed8" : "#2b2b3a",
                    color: "#fff",
                    cursor: me?.isHost ? "pointer" : "not-allowed",
                    opacity: me?.isHost ? 1 : 0.6,
                  }}
                >
                  Выбрать Ghost Letters
                </button>

                <button
                  disabled={!me?.isHost}
                  onClick={() => {
                    socket.emit("room:setGame", { code: snap.code, byPlayerId: playerId, gameId: "dogtown" });
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    background: me?.isHost ? "#9333ea" : "#2b2b3a",
                    color: "#fff",
                    cursor: me?.isHost ? "pointer" : "not-allowed",
                    opacity: me?.isHost ? 1 : 0.6,
                  }}
                >
                  Выбрать Dogtown
                </button>

                {!me?.isHost ? (
                  <span style={{ opacity: 0.7, fontSize: 13 }}>Только хост может выбрать игру</span>
                ) : null}
              </div>
            </div>
          ) : gameStatus !== "running" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 12, border: "1px solid #333", opacity: 0.9 }}>
                Выбрана игра: <b>{gameId}</b>
                <div style={{ opacity: 0.75, marginTop: 6 }}>
                  Для старта нужно {minPlayers}+ игроков. Сейчас: {players.length}.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  disabled={!me?.isHost || players.length < minPlayers}
                  onClick={() => {
                    socket.emit("room:startGame", { code: snap.code, byPlayerId: playerId });
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    background: me?.isHost && players.length >= minPlayers ? "#16a34a" : "#2b2b3a",
                    color: "#fff",
                    cursor: me?.isHost && players.length >= minPlayers ? "pointer" : "not-allowed",
                    opacity: me?.isHost && players.length >= minPlayers ? 1 : 0.6,
                  }}
                >
                  Старт
                </button>

                {!me?.isHost ? (
                  <span style={{ opacity: 0.7, fontSize: 13 }}>Только хост может начать игру</span>
                ) : players.length < minPlayers ? (
                  <span style={{ opacity: 0.7, fontSize: 13 }}>Нужно {minPlayers}+ игрока</span>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 12, border: "1px dashed #333", opacity: 0.8 }}>
              Игра запущена — перенаправляем…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
