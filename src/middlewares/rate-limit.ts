import type { NextFunction, Request, Response } from 'express';
import { redis } from '../db/redis.js';
import { HttpError } from '../utils/http-error.js';

interface RateLimitOptions {
  name: string;
  max: number;
  windowSeconds: number;
}

// Simple fixed window. The counter is in Redis so it still works with several instances.
// TODO: sliding window if this ever needs to be more precise
export function rateLimit({ name, max, windowSeconds }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `ratelimit:${name}:${req.ip ?? 'unknown'}`;

    const [[, count], [, ttl]] = (await redis
      .multi()
      .incr(key)
      .ttl(key)
      .exec()) as [[Error | null, number], [Error | null, number]];

    if (ttl === -1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, max - count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (count > max) {
      res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds);
      throw new HttpError(429, 'Too many requests, please try again later');
    }
    next();
  };
}
