/** Export/import a save as a JSON file (validated on import). */
import type { GameState } from "../engine";
import { validateImport } from "./saveLoad";

export function exportSave(game: GameState): void {
  const blob = new Blob([JSON.stringify({ v: game.schemaVersion, game }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lemonade-lane-day${game.day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Prompt for a JSON file and return the validated GameState (or null). */
export function importSaveFromFile(): Promise<GameState | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve(validateImport(JSON.parse(text)));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
