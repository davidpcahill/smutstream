import { db, type DbComment } from "./db.js";

const insertStmt = db.prepare(
  `INSERT INTO post_comments (post_id, user_id, user_name, text, at) VALUES (?, ?, ?, ?, ?)`,
);
const recentStmt = db.prepare<[number, number], DbComment>(
  `SELECT * FROM post_comments WHERE post_id = ? ORDER BY at DESC LIMIT ?`,
);

export function insertComment(
  postId: number,
  userId: number | null,
  userName: string,
  text: string,
): { id: number; at: number } {
  const at = Date.now();
  const res = insertStmt.run(postId, userId, userName, text, at);
  return { id: Number(res.lastInsertRowid), at };
}

export function recentCommentsFor(postId: number, limit = 8): DbComment[] {
  return recentStmt.all(postId, limit).reverse();
}
