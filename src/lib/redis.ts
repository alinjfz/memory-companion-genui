import { createClient, type RedisClientType } from "redis";

type MemoryEntry = { value: string; expiresAt: number | null };

const memoryStore = new Map<string, MemoryEntry>();

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

async function getClient() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (client?.isOpen) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const next = createClient({ url });
      next.on("error", (error) => {
        console.error("[echoes] Redis error:", error);
      });
      await next.connect();
      client = next as RedisClientType;
      return client;
    } catch (error) {
      console.warn("[echoes] Redis unavailable, using in-memory fallback:", error);
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

function memoryGet(key: string) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds?: number) {
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export async function redisGet(key: string) {
  const redis = await getClient();
  if (redis) {
    try {
      return await redis.get(key);
    } catch {
      return memoryGet(key);
    }
  }
  return memoryGet(key);
}

export async function redisSet(key: string, value: string, ttlSeconds?: number) {
  const redis = await getClient();
  if (redis) {
    try {
      if (ttlSeconds) {
        await redis.set(key, value, { EX: ttlSeconds });
      } else {
        await redis.set(key, value);
      }
      return;
    } catch {
      memorySet(key, value, ttlSeconds);
      return;
    }
  }
  memorySet(key, value, ttlSeconds);
}

export async function redisDel(key: string) {
  const redis = await getClient();
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      memoryStore.delete(key);
    }
    return;
  }
  memoryStore.delete(key);
}

export async function redisPushActivity(accessCode: string, eventJson: string) {
  const key = `echoes:activity:${accessCode}`;
  const redis = await getClient();
  if (redis) {
    try {
      await redis.lPush(key, eventJson);
      await redis.lTrim(key, 0, 199);
      return;
    } catch {
      /* fall through */
    }
  }
  const existing = memoryGet(key);
  const list = existing ? (JSON.parse(existing) as string[]) : [];
  list.unshift(eventJson);
  memorySet(key, JSON.stringify(list.slice(0, 200)));
}

export async function redisGetActivity(accessCode: string) {
  const key = `echoes:activity:${accessCode}`;
  const redis = await getClient();
  if (redis) {
    try {
      return await redis.lRange(key, 0, 199);
    } catch {
      /* fall through */
    }
  }
  const existing = memoryGet(key);
  return existing ? (JSON.parse(existing) as string[]) : [];
}
