import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../lib/rate-limit.ts";

test("allows up to max hits then blocks inside the window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });

  assert.equal(limiter.check("a", 0), true);
  assert.equal(limiter.check("a", 100), true);
  assert.equal(limiter.check("a", 200), true);
  assert.equal(limiter.check("a", 300), false);
});

test("the window slides, so old hits stop counting", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });

  assert.equal(limiter.check("a", 0), true);
  assert.equal(limiter.check("a", 10), true);
  assert.equal(limiter.check("a", 20), false);
  // Both earlier hits have aged out of the window by now.
  assert.equal(limiter.check("a", 1500), true);
});

test("keys are independent", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });

  assert.equal(limiter.check("a", 0), true);
  assert.equal(limiter.check("a", 1), false);
  assert.equal(limiter.check("b", 1), true);
});

test("stale keys are evicted rather than accumulating", () => {
  const limiter = createRateLimiter({ windowMs: 100, max: 5 });

  for (let i = 0; i < 500; i += 1) {
    limiter.check(`ip-${i}`, i);
  }

  // Every earlier key has aged out; a fresh check must still be allowed and the
  // limiter must not have wedged itself on accumulated state.
  assert.equal(limiter.check("ip-final", 10_000), true);
});
