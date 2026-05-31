import { describe, expect, test } from "bun:test";
import { Rng, seedFromString } from "../src/engine/rng";

describe("Rng", () => {
  test("same seed → identical stream", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  test("different seeds → different streams", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 50; i++) if (a.next() === b.next()) same++;
    expect(same).toBeLessThan(5);
  });

  test("state round-trips: resuming from saved state continues the stream", () => {
    const a = new Rng(7);
    for (let i = 0; i < 10; i++) a.next();
    const saved = a.state;
    const tail = [a.next(), a.next(), a.next()];
    const resumed = new Rng(0);
    resumed.state = saved;
    expect([resumed.next(), resumed.next(), resumed.next()]).toEqual(tail);
  });

  test("uniform/int stay in range", () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const u = r.uniform(2, 5);
      expect(u).toBeGreaterThanOrEqual(2);
      expect(u).toBeLessThan(5);
      const n = r.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  test("poisson mean roughly tracks lambda", () => {
    const r = new Rng(5);
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) sum += r.poisson(2.5);
    expect(sum / N).toBeGreaterThan(2.3);
    expect(sum / N).toBeLessThan(2.7);
  });

  test("seedFromString is stable and varied", () => {
    expect(seedFromString("hello")).toBe(seedFromString("hello"));
    expect(seedFromString("hello")).not.toBe(seedFromString("world"));
  });
});
