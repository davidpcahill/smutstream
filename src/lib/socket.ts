import { io, type Socket } from "socket.io-client";
import { useEffect } from "react";
import { useState } from "react";
import type { AppSettings, CommentEvent, DisplayState, ReactionEvent } from "./types";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  }
  return socket;
}

export function useDisplayState(): DisplayState | null {
  const [state, setState] = useState<DisplayState | null>(null);
  useEffect(() => {
    const s = getSocket();
    const onState = (next: DisplayState) => setState(next);
    s.on("state", onState);
    return () => {
      s.off("state", onState);
    };
  }, []);
  return state;
}

export function onSettings(handler: (settings: AppSettings) => void): () => void {
  const s = getSocket();
  s.on("settings", handler);
  return () => { s.off("settings", handler); };
}

export function onReaction(handler: (evt: ReactionEvent) => void): () => void {
  const s = getSocket();
  s.on("reaction", handler);
  return () => { s.off("reaction", handler); };
}

export function onComment(handler: (evt: CommentEvent) => void): () => void {
  const s = getSocket();
  s.on("comment", handler);
  return () => { s.off("comment", handler); };
}
