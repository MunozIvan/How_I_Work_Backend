import { redis } from '../db/redis.js';
import { env } from '../config/env.js';

// cache-aside: try Redis, otherwise run the loader and save the result
export async function getOrSet<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds = env.CACHE_TTL_SECONDS,
): Promise<{ value: T; hit: boolean }> {
  const cached = await redis.get(key);
  if (cached !== null) {
    return { value: JSON.parse(cached) as T, hit: true };
  }
  const value = await loader();
  if (value !== null && value !== undefined) {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  return { value, hit: false };
}

// sorted so ?a=1&b=2 and ?b=2&a=1 hit the same key
export function buildKey(prefix: string, params: Record<string, unknown>): string {
  const normalized = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return normalized ? `${prefix}:${normalized}` : prefix;
}
