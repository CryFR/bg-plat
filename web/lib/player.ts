export function getPlayerId() {
  if (typeof window === "undefined") return "";
  const key = "bg_player_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function getSavedName(defaultName = "Nik") {
  if (typeof window === "undefined") return defaultName;
  return localStorage.getItem("bg_player_name") || defaultName;
}

export function saveName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("bg_player_name", name);
}
