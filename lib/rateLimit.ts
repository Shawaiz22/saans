/**
 * @file rateLimit.ts
 * @description Lightweight in-memory per-IP rate limiting utility.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitRecord>();

/**
 * Checks whether the requesting IP has exceeded rate limit.
 *
 * @param ip - Client IP identifier.
 * @param limit - Maximum requests allowed in window (default: 30).
 * @param windowMs - Sliding window duration in milliseconds (default: 60,000ms = 1 minute).
 * @returns Object indicating whether request is allowed and remaining quota.
 */
export function checkRateLimit(
  ip: string = "127.0.0.1",
  limit: number = 30,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = ipMap.get(ip);

  if (!record || now > record.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count };
}
