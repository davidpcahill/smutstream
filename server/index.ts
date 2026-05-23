import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { identityMiddleware } from "./identity.js";
import { router } from "./routes.js";
import { attachSockets } from "./sockets.js";
import { scheduler } from "./scheduler.js";
import { startCacheSweeper } from "./cache.js";
import { getLanInfo } from "./lan.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(identityMiddleware);

app.use("/cache", express.static(config.cache.dir, { maxAge: "1h", immutable: true }));
app.use(router);

if (fs.existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(config.webDistDir, "index.html"));
  });
}

const server = http.createServer(app);
attachSockets(server);
scheduler.start();
startCacheSweeper();

server.listen(config.port, config.bindHost, () => {
  const lan = getLanInfo();
  const host = lan.primaryIp ?? "localhost";
  const publicUrl = `http://${host}:${config.publicPort}`;
  const apiUrl = `http://${host}:${config.port}`;
  const isDev = config.publicPort !== config.port;
  console.log(`smutstream listening`);
  console.log(`  api:      ${apiUrl}`);
  console.log(`  display:  ${publicUrl}/display`);
  console.log(`  control:  ${publicUrl}/`);
  console.log(`  hostname: ${lan.hostname}`);
  if (isDev) console.log(`  (dev mode: UI is served by Vite on :${config.publicPort})`);
  if (!config.e621.username || !config.e621.apiKey) {
    console.warn("  warning: no e621 credentials in .env -- using anonymous access");
  }
});
