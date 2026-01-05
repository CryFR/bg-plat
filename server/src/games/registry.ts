// server/src/games/registry.ts
import type { GameAdapter } from "./types.js";
import { ghostLettersAdapter } from "./ghost-letters/index.js";

const registry: Record<string, GameAdapter> = {
  [ghostLettersAdapter.id]: ghostLettersAdapter,
};

export function getGameAdapter(id: string): GameAdapter | null {
  return registry[id] ?? null;
}

export function allGameAdapters(): GameAdapter[] {
  return Object.values(registry);
}
