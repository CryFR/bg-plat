/**
 * Registry of game room UIs.
 * Add a new game by:
 *  1) creating folder ./<gameId>/Room.tsx (default export component)
 *  2) registering it here
 */
export const gameRoomLoaders: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  "ghost-letters": () => import("./ghost-letters/Room"),
};
