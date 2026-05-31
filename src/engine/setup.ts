import { DEFAULT_RECIPE } from "../data/products";
import { STARTER_LOCATION_ID } from "../data/locations";
import { Rng } from "./rng";
import { initialWeather } from "./weatherGen";
import { rollEvent } from "./eventRoll";
import { TUNING } from "./tuning";
import type { GameMode, GameState, Stats } from "./types";

function emptyStats(): Stats {
  return {
    totalCupsSold: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalTips: 0,
    totalCustomersLost: 0,
    bestDayProfit: 0,
    bestDayProfitDay: 0,
    bestDayCups: 0,
    daysPlayed: 0,
    currentProfitStreak: 0,
    longestProfitStreak: 0,
    sumStars: 0,
    countStars: 0,
    peakReputation: 10,
    peakCash: TUNING.STARTING_CASH,
    locationsUnlocked: 1,
  };
}

/** Create a fresh game from a seed. Deterministic from the seed alone. */
export function newGame(seed: number, mode: GameMode = "campaign"): GameState {
  const rng = new Rng(seed);
  const weatherToday = initialWeather(rng, TUNING.FORECAST_ACCURACY);
  const activeEventId = rollEvent(rng, 1);

  return {
    schemaVersion: TUNING.SCHEMA_VERSION,
    seed,
    rngState: rng.state,
    mode,
    day: 1,
    cash: TUNING.STARTING_CASH,
    debt: 0,
    reputationGlobal: 10,
    locationRep: { [STARTER_LOCATION_ID]: 10 },
    regularsPool: 0,
    currentLocationId: STARTER_LOCATION_ID,
    unlockedLocationIds: [STARTER_LOCATION_ID],
    recipe: { ...DEFAULT_RECIPE },
    inventory: [],
    ownedEquipmentIds: [],
    staff: [],
    marketingSpend: 0,
    todayStockSpend: 0,
    todayEquipmentSpend: 0,
    qualityScoreEMA: 0.5,
    recipeFeedback: { lemon: 0, sugar: 0, ice: 0 },
    priceFeedback: 0,
    weatherToday,
    activeEventId,
    completedGoalIds: [],
    unlockedAchievementIds: [],
    stats: emptyStats(),
    history: [],
    gameOver: false,
  };
}
