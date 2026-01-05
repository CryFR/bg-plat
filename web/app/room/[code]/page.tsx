"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "../../../lib/socket";
import { getPlayerId, getSavedName, saveName } from "../../../lib/player";

type Player = {
  playerId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
};

type Snapshot = {
  code: string;
  players: Player[];
  game: null | { id: "ghost-letters"; state: any };
};

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const socket = useMemo(() => getSocket(), []);

  const [name, setName] = useState(getSavedName("Nik"));
  const [joined, setJoined] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [meReady, setMeReady] = useState(false);

  const roomLink = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    const onUpdate = (s: Snapshot) => setSnap(s);

    const onKicked = () => {
      alert("Тебя кикнули из комнаты");
      window.location.href = "/bg";
    };

    socket.on("room:update", onUpdate);
    socket.on("room:kicked", onKicked);

    return () => {
      socket.off("room:update", onUpdate);
      socket.off("room:kicked", onKicked);
    };
  }, [socket]);

  useEffect(() => {
    if (snap?.game?.id === "ghost-letters") {
      router.push(`/room/${code}/game/ghost-letters`);
    }
  }, [snap, router, code]);

  useEffect(() => {
  const myPid = getPlayerId();
  const p = snap?.players?.find((x) => x.playerId === myPid);
  if (p) setMeReady(!!p.ready);
}, [snap]);

  function join() {
    const clean = name.trim();
    if (!clean) return;

    saveName(clean);
    socket.emit("room:join", { code, name: clean, playerId: getPlayerId() }, (res: any) => {
      if (res?.error) {
        alert("Комната не найдена");
        return;
      }
      setJoined(true);
      setSnap(res.snapshot);
    });
  }

  function toggleReady() {
    const next = !meReady;
    setMeReady(next);

    socket.emit("room:ready", { code, playerId: getPlayerId(), ready: next }, (res: any) => {
      if (!res?.ok) {
        // откатим локальный стейт, если сервер не принял
        setMeReady(!next);
        alert(res?.error ?? "Не удалось поменять готовность");
      }
    });
  }

  function start() {
    socket.emit("game:ghostletters:start", { code, byPlayerId: getPlayerId() }, (res: any) => {
      if (!res?.ok) {
        if (res?.error === "NEED_4P_FOR_COMPETITIVE") alert("Нужно минимум 4 игрока для соревновательного режима");
        else alert(res?.error ?? "Не удалось стартовать");
      }
    });
  }

  function kick(targetPlayerId: string) {
    socket.emit("room:kick", { code, byPlayerId: getPlayerId(), targetPlayerId }, (res: any) => {
      if (!res?.ok) alert(res?.error ?? "Не удалось кикнуть");
    });
  }

  const myPid = getPlayerId();
  const me = snap?.players?.find((p) => p.playerId === myPid);
  const isHost = !!me?.isHost;
  const allReady = (snap?.players?.length ?? 0) > 0 && (snap?.players ?? []).every((p) => p.ready);

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Комната {code}</h1>
        <button
          onClick={() => navigator.clipboard.writeText(roomLink)}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #444",
            background: "#111",
            color: "#eee",
          }}
        >
          Скопировать ссылку
        </button>
      </div>

      {!joined && (
        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Никнейм"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "#121220", color: "#eee" }}
          />
          <button
            onClick={join}
            disabled={!name.trim()}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #444", background: "#1d4ed8", color: "#fff" }}
          >
            Войти
          </button>
        </div>
      )}

      <div style={{ marginTop: 18, border: "1px solid #2a2a3a", background: "#10101a", padding: 16, borderRadius: 16 }}>
        <h2 style={{ marginTop: 0 }}>Игроки</h2>

        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(snap?.players ?? []).map((p) => (
            <li key={p.playerId} style={{ marginBottom: 8, opacity: p.connected ? 1 : 0.55 }}>
              {p.name} {p.isHost ? "(host)" : ""} — {p.ready ? "готов" : "не готов"} {p.connected ? "" : " (offline)"}
              {isHost && !p.isHost && (
                <button
                  onClick={() => kick(p.playerId)}
                  style={{
                    marginLeft: 10,
                    padding: "2px 8px",
                    borderRadius: 10,
                    border: "1px solid #444",
                    background: "#2a0f14",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Kick
                </button>
              )}
            </li>
          ))}
        </ul>

        {joined && (
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
            <button
              onClick={toggleReady}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #444",
                background: meReady ? "#166534" : "#111",
                color: "#eee",
              }}
            >
              {meReady ? "Я не готов" : "Я готов"}
            </button>

            {isHost && (
              <button
                onClick={start}
                disabled={!allReady}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #444",
                  background: allReady ? "#1d4ed8" : "#222",
                  color: "#fff",
                  cursor: allReady ? "pointer" : "not-allowed",
                }}
              >
                Старт: Письма призрака
              </button>
            )}

            {!isHost && <span style={{ opacity: 0.7, fontSize: 13 }}>Стартует хост</span>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, opacity: 0.65, fontSize: 13 }}>
        Комнаты не отображаются публично — только по ссылке. Реконнект работает (роль/рука сохраняются).
      </div>
    </div>
  );
}
