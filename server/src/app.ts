// server/src/app.ts
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import { config } from "./config.js";
import { registerPlatform } from "./platform/index.js";
import { startCleanup } from "./platform/cleanup.js";
import type { ServerContext } from "./platform/types.js";

export function createServer() {
  const app = express();
  app.use(express.json());

  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    })
  );

  app.get("/health", (_req, res) => res.json({ ok: true, t: Date.now() }));

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: config.CORS_ORIGIN,
      credentials: true,
    },
    transports: ["websocket"],
  });

  const ctx: ServerContext = {
    io,
    config,
    now: () => Date.now(),
  };

  registerPlatform(ctx);
  startCleanup(ctx);

  return { app, server, io, ctx };
}
