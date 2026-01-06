"use client";

import { useEffect, useMemo, useState } from "react";
import { getSocket } from "../socket";
import { getPlayerId, getSavedName } from "../player";
import type { RoomSnapshot } from "./types";

type JoinAck = any;

export function useRoom(code: string) {
  const socket = useMemo(() => getSocket(), []);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const onUpdate = (next: RoomSnapshot) => setSnap(next);
    const onKicked = (payload: any) => setKicked(payload?.reason || "kicked");

    socket.on("room:update", onUpdate);
    socket.on("room:kicked", onKicked);

    // join once
    socket.emit(
      "room:join",
      { code, name: getSavedName("Player"), playerId: getPlayerId() },
      (res: JoinAck) => {
        if (res?.ok && res?.snapshot) setSnap(res.snapshot);
        else if (res?.snapshot) setSnap(res.snapshot);
        else if (res?.code && res?.players) setSnap(res); // legacy: snapshot directly
        else if (res?.error) setKicked(res.error);
      }
    );

    // Heartbeat: keep lastSeen fresh during long phases where player might not click.
    const t = setInterval(() => {
      socket.emit("room:seen", { code, playerId: getPlayerId() });
    }, 10000);

    return () => {
      clearInterval(t);
      socket.off("room:update", onUpdate);
      socket.off("room:kicked", onKicked);
    };
  }, [socket, code]);

  return { socket, snap, setSnap, kicked };
}
