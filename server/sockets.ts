import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { scheduler } from "./scheduler.js";
import { getSettingsForClient } from "./settings.js";

export type ReactionEvent = {
  /** "up" = upvote (also bumps the per-image counter); "emoji" = ephemeral
   *  picker reaction with no counter. */
  kind: "up" | "emoji";
  emoji: string;        // the actual glyph to render on display
  postId: number;
  userName: string;
  total: number | null; // null for ephemeral emoji reactions
  at: number;
};
export type CommentEvent = {
  id: number;
  postId: number;
  userName: string;
  text: string;
  at: number;
  origin: "live" | "replay";
};

let ioRef: IOServer | null = null;

export function attachSockets(http: HttpServer): IOServer {
  const io = new IOServer(http, {
    cors: { origin: true, credentials: true },
  });
  ioRef = io;

  io.on("connection", (socket) => {
    socket.emit("state", scheduler.state());
    socket.emit("settings", getSettingsForClient());
  });

  scheduler.on("state", (state) => {
    io.emit("state", state);
  });

  return io;
}

export function broadcastSettings(): void {
  ioRef?.emit("settings", getSettingsForClient());
}

export function broadcastReaction(evt: ReactionEvent): void {
  ioRef?.emit("reaction", evt);
}

export function broadcastComment(evt: CommentEvent): void {
  ioRef?.emit("comment", evt);
}
