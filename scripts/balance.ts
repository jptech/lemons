/**
 * Headless balance check — plays a reasonable fixed strategy across several
 * seeds and prints the early-game profit/difficulty curve. Sanity, not a test:
 *
 *   bun run balance
 */
import {
  buyStock,
  newGame,
  setMarketing,
  setRecipe,
  simulateDay,
  type GameState,
  type ItemId,
} from "../src/engine";
import { inventoryQty } from "../src/engine/derive";
import { WEATHER_DEMAND_MULT } from "../src/engine/tuning";

/** Buy only enough to reach a target stock level (a sane player tops up). */
function topUp(s: GameState, item: ItemId, target: number): GameState {
  const need = Math.max(0, Math.round(target) - inventoryQty(s, item));
  return need > 0 ? buyStock(s, item, need) : s;
}

/** A sensible-but-simple human-ish strategy. */
function planMorning(s: GameState): GameState {
  // Warm-weather-leaning recipe, price nudged up as reputation grows.
  const price = 1.4 + Math.min(0.8, s.reputationGlobal / 100);
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: price });

  // Stock to the forecast: more when it looks hot, less when cool.
  const heat = WEATHER_DEMAND_MULT[s.weatherToday.forecast.condition];
  const scale = Math.max(0.4, Math.min(1.6, heat));
  s = topUp(s, "lemon", 55 * scale);
  s = topUp(s, "sugar", 55 * scale);
  s = topUp(s, "cup", 120 * scale);
  s = topUp(s, "ice", 80 * scale); // melts nightly → effectively a daily buy

  // A little marketing once there's a buffer.
  if (s.cash > 120) s = setMarketing(s, 20);
  return s;
}

function run(seed: number, days: number) {
  let s = newGame(seed, "sandbox");
  const rows: string[] = [];
  let died = -1;
  for (let i = 0; i < days; i++) {
    s = planMorning(s);
    const { state, result } = simulateDay(s);
    s = state;
    rows.push(
      `  d${String(result.day).padStart(2)} ${result.weather.condition.padEnd(8)} ` +
        `served ${String(result.served).padStart(3)}/${String(result.potentialCustomers).padStart(3)} ` +
        `rev $${result.revenue.toFixed(0).padStart(4)} ` +
        `profit ${(result.profit >= 0 ? " " : "") + result.profit.toFixed(0).padStart(4)} ` +
        `cash $${result.cashEnd.toFixed(0).padStart(5)} ` +
        `rep ${result.reputationEnd.toFixed(0).padStart(2)} ` +
        `★${result.avgStars.toFixed(1)}`,
    );
    if (s.gameOver) {
      died = result.day;
      break;
    }
  }
  return { state: s, rows, died };
}

const DAYS = 20;
const seeds = [1, 2, 3, 7, 42, 1234];
let deaths = 0;

for (const seed of seeds) {
  const { state, rows, died } = run(seed, DAYS);
  console.log(`\nseed ${seed}:`);
  for (const r of rows) console.log(r);
  if (died > 0) {
    deaths++;
    console.log(`  💀 bankrupt on day ${died}`);
  } else {
    console.log(
      `  ✅ survived ${DAYS} days — cash $${state.cash.toFixed(0)}, ` +
        `rep ${state.reputationGlobal.toFixed(0)}, ` +
        `lifetime profit $${state.stats.totalProfit.toFixed(0)}, ` +
        `best day $${state.stats.bestDayProfit.toFixed(0)}`,
    );
  }
}

console.log(
  `\n${seeds.length - deaths}/${seeds.length} seeds survived ${DAYS} days with the baseline strategy.`,
);
