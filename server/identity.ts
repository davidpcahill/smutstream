import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, type DbUser } from "./db.js";

const COOKIE = "ss_uid";

const insertUser = db.prepare(`INSERT INTO users (token, name, created_at) VALUES (?, ?, ?)`);
const findByToken = db.prepare<[string], DbUser>(`SELECT * FROM users WHERE token = ?`);
const updateName = db.prepare(`UPDATE users SET name = ? WHERE id = ?`);

export type RequestUser = DbUser;

declare module "express-serve-static-core" {
  interface Request {
    user?: RequestUser;
  }
}

export function identityMiddleware(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.[COOKIE] as string | undefined;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });
  }
  let user = findByToken.get(token);
  if (!user) {
    const result = insertUser.run(token, "Guest", Date.now());
    user = { id: Number(result.lastInsertRowid), token, name: "Guest", created_at: Date.now() };
  }
  req.user = user;
  next();
}

export function setName(userId: number, name: string): void {
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) return;
  updateName.run(trimmed, userId);
}
