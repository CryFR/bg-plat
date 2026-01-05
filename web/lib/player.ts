const KEY = "bg_player_id";
const NAME_KEY = "bg_player_name";

function randomIdFallback() {
  // достаточно для playerId (не крипто-идеально, но ок)
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getPlayerId() {
  if (typeof window === "undefined") return "server";

  let id = localStorage.getItem(KEY);
  if (!id) {
    const c: any = (globalThis as any).crypto;

    if (c && typeof c.randomUUID === "function") {
      id = c.randomUUID();
    } else {
      id = randomIdFallback();
    }

    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getSavedName(fallback = "Player") {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(NAME_KEY) || fallback;
}

export function saveName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NAME_KEY, name);
}
