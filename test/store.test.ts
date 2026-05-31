import { describe, expect, test } from "bun:test";
import { createStore } from "../src/store/store";

const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe("createStore", () => {
  test("getState returns initial state", () => {
    const s = createStore({ n: 1 });
    expect(s.getState().n).toBe(1);
  });

  test("setState swaps state and notifies once per microtask batch", async () => {
    const s = createStore({ n: 0 });
    let notifies = 0;
    let lastSeen = -1;
    s.subscribe((st) => {
      notifies++;
      lastSeen = st.n;
    });

    s.setState((st) => ({ n: st.n + 1 }));
    s.setState((st) => ({ n: st.n + 1 }));
    s.setState((st) => ({ n: st.n + 1 }));

    expect(s.getState().n).toBe(3); // state updates synchronously
    expect(notifies).toBe(0); // but notify is deferred

    await tick();
    expect(notifies).toBe(1); // three updates coalesce into one notify
    expect(lastSeen).toBe(3);
  });

  test("no-op updater (returns same ref) does not notify", async () => {
    const s = createStore({ n: 5 });
    let notifies = 0;
    s.subscribe(() => notifies++);
    s.setState((st) => st);
    await tick();
    expect(notifies).toBe(0);
  });

  test("unsubscribe stops further notifications", async () => {
    const s = createStore({ n: 0 });
    let notifies = 0;
    const off = s.subscribe(() => notifies++);
    s.setState((st) => ({ n: st.n + 1 }));
    await tick();
    expect(notifies).toBe(1);
    off();
    s.setState((st) => ({ n: st.n + 1 }));
    await tick();
    expect(notifies).toBe(1);
  });
});
