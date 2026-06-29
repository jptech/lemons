import { describe, expect, test } from "bun:test";
import { newGame, simulateDay, hireStaff, setStaffResting, TUNING, type GameState, type Staff } from "../src/engine";
import { fatigueMult } from "../src/engine/derive";

function mkStaff(id: string, over: Partial<Staff> = {}): Staff {
  return { id, tier: 1, name: "Helper", icon: "🧑", wage: 35, serveSpeedBonus: 0, batchSpeedBonus: 0, role: "SERVE", xp: 0, level: 0, fatigue: 0, resting: false, ...over };
}

function stocked(g: GameState): GameState {
  return { ...g, inventory: [
    { item: "cup", qty: 200, ageDays: 0 }, { item: "lemon", qty: 200, ageDays: 0 },
    { item: "sugar", qty: 200, ageDays: 0 }, { item: "ice", qty: 200, ageDays: 0 },
  ] };
}

describe("staff cap (Phase L4)", () => {
  test("the cap is lifted to 5 and enforced", () => {
    expect(TUNING.STAFF_CAP).toBe(5);
    let s = newGame(1, "sandbox");
    for (let i = 0; i < 7; i++) s = hireStaff(s, 1);
    expect(s.staff.length).toBe(5);
  });
});

describe("fatigue", () => {
  test("fatigueMult is neutral when fresh and slower when tired", () => {
    expect(fatigueMult(0)).toBe(1);
    expect(fatigueMult(100)).toBeCloseTo(1 - TUNING.FATIGUE_SPEED_PENALTY, 6);
    expect(fatigueMult(50)).toBeLessThan(1);
  });

  test("rises with work and the rest plan resets each day", () => {
    const g = stocked({ ...newGame(1, "sandbox"), staff: [mkStaff("a")] });
    const { state } = simulateDay(g);
    expect(state.staff[0]!.fatigue).toBe(TUNING.FATIGUE_WORK);
    expect(state.staff[0]!.resting).toBe(false);
  });

  test("recovers when resting (and skips XP that day)", () => {
    const g = stocked({ ...newGame(1, "sandbox"), staff: [mkStaff("a", { fatigue: 50, resting: true, xp: 100 })] });
    const { state } = simulateDay(g);
    expect(state.staff[0]!.fatigue).toBe(50 - TUNING.FATIGUE_REST);
    expect(state.staff[0]!.xp).toBe(100); // didn't work → no XP
    expect(state.staff[0]!.resting).toBe(false); // plan reset
  });

  test("a tired crew genuinely serves less than a fresh one", () => {
    const fresh = stocked({ ...newGame(5, "sandbox"), staff: [mkStaff("a"), mkStaff("b")] });
    const tired = stocked({ ...newGame(5, "sandbox"), staff: [mkStaff("a", { fatigue: 100 }), mkStaff("b", { fatigue: 100 })] });
    expect(simulateDay(tired).result.cupsSold).toBeLessThanOrEqual(simulateDay(fresh).result.cupsSold);
  });
});

describe("payroll", () => {
  test("crews beyond the free count pay a marginal premium", () => {
    const five = [0, 1, 2, 3, 4].map((i) => mkStaff(`s${i}`, { wage: 35 }));
    const g = stocked({ ...newGame(1, "sandbox"), staff: five });
    const { result } = simulateDay(g);
    const mult = 1 + TUNING.WAGE_MARGINAL_STEP * (5 - TUNING.WAGE_MARGINAL_FREE);
    expect(result.costs.wages).toBeCloseTo(5 * 35 * mult, 4);
  });

  test("a resting staffer draws only the retainer fraction", () => {
    const staff = [mkStaff("a", { wage: 35 }), mkStaff("b", { wage: 35, resting: true }), mkStaff("c", { wage: 35 })];
    const g = stocked({ ...newGame(1, "sandbox"), staff });
    const { result } = simulateDay(g);
    // 3 staff = no marginal premium (≤ free count); one pays half.
    expect(result.costs.wages).toBeCloseTo(35 + 35 * TUNING.REST_WAGE_FRACTION + 35, 4);
  });

  test("setStaffResting toggles the plan without mutating input", () => {
    const g = { ...newGame(1, "sandbox"), staff: [mkStaff("a")] };
    const s = setStaffResting(g, "a", true);
    expect(s.staff[0]!.resting).toBe(true);
    expect(g.staff[0]!.resting).toBe(false);
  });
});
