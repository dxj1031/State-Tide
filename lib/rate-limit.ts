export type RateLimiter = {
  /** Returns false once the key has exceeded `max` hits inside the window. */
  check(key: string, now?: number): boolean;
};

/**
 * Fixed-memory sliding window, per running instance.
 *
 * ponytail: in-process only. Serverless spreads traffic over several ephemeral
 * instances, so the effective global limit is `max × instances` and a cold start
 * resets it — this stops naive loops, not a distributed attacker. Move the
 * counter to Vercel KV / Upstash if that stops being good enough. The hard
 * ceiling on loss is the spend limit on the Anthropic key, not this.
 */
export function createRateLimiter({
  windowMs,
  max
}: {
  windowMs: number;
  max: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key: string, now = Date.now()) {
      const cutoff = now - windowMs;

      // Drop stale keys so the map cannot grow without bound.
      for (const [existing, times] of hits) {
        const live = times.filter((time) => time > cutoff);

        if (live.length === 0) {
          hits.delete(existing);
        } else {
          hits.set(existing, live);
        }
      }

      const recent = hits.get(key) ?? [];

      if (recent.length >= max) {
        return false;
      }

      hits.set(key, [...recent, now]);

      return true;
    }
  };
}
