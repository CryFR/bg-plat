// server/src/config.ts

export const config = {
  PORT: Number(process.env.PORT ?? 3001),

  // For dev you can keep origin:true, or set explicit URL(s)
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : true,

  // rate-limit for room:create (ms)
  CREATE_RATE_LIMIT_MS: Number(process.env.CREATE_RATE_LIMIT_MS ?? 1500),

  // room TTL when nobody connected (ms)
  EMPTY_ROOM_TTL_MS: Number(process.env.EMPTY_ROOM_TTL_MS ?? 10 * 60 * 1000),

  // mark connected=false if no pings/traffic for too long (ms)
  PLAYER_INACTIVE_AFTER_MS: Number(process.env.PLAYER_INACTIVE_AFTER_MS ?? 2 * 60 * 1000),

  // cleanup tick
  CLEANUP_TICK_MS: Number(process.env.CLEANUP_TICK_MS ?? 30 * 1000),
} as const;
