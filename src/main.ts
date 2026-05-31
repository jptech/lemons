import "./styles/fonts.css";
import "./styles/reset.css";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/components.css";

import { startRouter } from "./ui/router";
import { actions, store } from "./store/gameStore";
import { simulateDay } from "./engine";

startRouter();

// Dev/debug handle — lets the console (and tooling) drive the store directly.
(globalThis as unknown as { __lemon?: unknown }).__lemon = { store, actions, simulateDay };
