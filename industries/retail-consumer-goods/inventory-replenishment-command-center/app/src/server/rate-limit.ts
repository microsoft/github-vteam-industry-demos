export interface RateLimitRule {
  bucket: string;
  scope: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds?: number;
}

export type Clock = () => number;

export class SlidingWindowRateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly clock: Clock = Date.now) {}

  attempt(rules: RateLimitRule[]): RateLimitDecision {
    const now = this.clock();
    const evaluated = rules.map((rule) => {
      const key = `${rule.bucket}:${rule.scope}`;
      const cutoff = now - rule.windowMs;
      const retained = (this.events.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
      if (retained.length === 0) this.events.delete(key);
      else this.events.set(key, retained);
      return { rule, key, retained };
    });
    const blocked = evaluated.filter(({ rule, retained }) => retained.length >= rule.limit);
    if (blocked.length > 0) {
      const retryAfterSeconds = Math.max(
        ...blocked.map(({ rule, retained }) =>
          Math.max(1, Math.ceil((retained[0]! + rule.windowMs - now) / 1000)),
        ),
      );
      const mostRestrictive = blocked.reduce((selected, candidate) =>
        candidate.rule.limit < selected.rule.limit ? candidate : selected,
      );
      return {
        allowed: false,
        limit: mostRestrictive.rule.limit,
        remaining: 0,
        resetSeconds: retryAfterSeconds,
        retryAfterSeconds,
      };
    }
    for (const item of evaluated) {
      item.retained.push(now);
      this.events.set(item.key, item.retained);
    }
    const mostRestrictive = evaluated.reduce((selected, candidate) => {
      const selectedRemaining = selected.rule.limit - selected.retained.length;
      const candidateRemaining = candidate.rule.limit - candidate.retained.length;
      return candidateRemaining < selectedRemaining ? candidate : selected;
    });
    const resetSeconds =
      mostRestrictive.retained.length === 0
        ? Math.ceil(mostRestrictive.rule.windowMs / 1000)
        : Math.max(
            1,
            Math.ceil(
              (mostRestrictive.retained[0]! + mostRestrictive.rule.windowMs - now) / 1000,
            ),
          );
    return {
      allowed: true,
      limit: mostRestrictive.rule.limit,
      remaining: Math.max(0, mostRestrictive.rule.limit - mostRestrictive.retained.length),
      resetSeconds,
    };
  }
}

export class ConcurrencyGuard {
  private active = 0;

  constructor(readonly limit: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.limit) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  get current(): number {
    return this.active;
  }
}
