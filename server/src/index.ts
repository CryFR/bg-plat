// server/src/index.ts
import { createServer } from "./app.js";
import { config } from "./config.js";

const { server } = createServer();

server.listen(config.PORT, () => {
  console.log(`WS server on http://localhost:${config.PORT}`);
});
