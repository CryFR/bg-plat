"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../../lib/socket";
import { getPlayerId, getSavedName, saveName } from "../../lib/player";

export default function BgPage() {
  const router = useRouter();
  const socket = useMemo(() => getSocket(), []);

  const [name, setName] = useState(getSavedName("Nik"));
  const [busy, setBusy] = useState(false);

  function createRoom(gameId: string) {
    // (no noisy logs in production)
    const clean = name.trim();
    if (!clean) return;

    saveName(clean);
    setBusy(true);

    socket.emit("room:create", { name: clean, playerId: getPlayerId(), gameId }, (res: any) => {
      setBusy(false);
      if (res?.code) router.push(`/room/${res.code}`);
      else alert("Не удалось создать комнату");
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>BG • Настолки онлайн</h1>
      <p style={{ opacity: 0.8 }}>Комнаты только по ссылке. Аккаунты не нужны.</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0 24px" }}>
        <label style={{ opacity: 0.8 }}>Ник:</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "#121220", color: "#eee" }}
        />
      </div>

      <div style={{ border: "1px solid #2a2a3a", background: "#10101a", padding: 16, borderRadius: 16 }}>
        <h2 style={{ marginTop: 0 }}>Письма призрака</h2>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          Соревновательный режим: Призрак + Убийца. 4-12 игроков.
        </p>
        <button
          disabled={busy || !name.trim()}
          onClick={() => createRoom("ghost-letters")}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #444",
            background: busy ? "#222" : "#1d4ed8",
            color: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Создаю..." : "Создать комнату"}
        </button>
      </div>

      <div
        style={{
          border: "1px solid #2a2a3a",
          background: "#10101a",
          padding: 16,
          borderRadius: 16,
          marginTop: 14,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Dogtown (Chinatown)</h2>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          Экономическая игра про районы и сделки. 3-5 игроков.
        </p>
        <button
          disabled={busy || !name.trim()}
          onClick={() => createRoom("dogtown")}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #444",
            background: busy ? "#222" : "#9333ea",
            color: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Создаю..." : "Создать комнату"}
        </button>
      </div>

      <div style={{ marginTop: 18, opacity: 0.65, fontSize: 13 }}>
        После создания — просто копируй ссылку из адресной строки и кидай друзьям.
      </div>
    </div>
  );
}
