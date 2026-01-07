// server/src/games/dogtown/socket.ts
import type { Socket } from "socket.io";
import type { ServerContext } from "../../platform/types.js";

/**
 * Пока игра "пассивная": только отображение доски на фронте.
 * Позже сюда добавим события (сделки, владение лотами, деньги и т.д.)
 */
export function registerDogtownSocketHandlers(_ctx: ServerContext, _socket: Socket) {
  // no-op
}
