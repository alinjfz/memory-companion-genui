import { randomBytes } from "node:crypto";
import { redisDel, redisGet, redisSet } from "@/lib/redis";

export type CaretakerSession = {
  accessCode: string;
  email: string;
  caretakerName: string;
  createdAt: number;
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sessionKey(token: string) {
  return `echoes:session:${token}`;
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export async function saveCaretakerSession(token: string, session: CaretakerSession) {
  await redisSet(sessionKey(token), JSON.stringify(session), SESSION_TTL_SECONDS);
}

export async function readCaretakerSession(token: string) {
  const raw = await redisGet(sessionKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CaretakerSession;
  } catch {
    return null;
  }
}

export async function deleteCaretakerSession(token: string) {
  await redisDel(sessionKey(token));
}
