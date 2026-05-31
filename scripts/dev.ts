/**
 * Lemonade Lane — dev server.
 *
 * Uses Bun's native full-stack HTML bundler: it bundles `index.html` (and the
 * TS/CSS it references) on the fly, serves hashed assets, and hot-reloads the
 * browser on source changes. No Vite/Webpack/nodemon needed.
 *
 *   bun run dev            # dev server with HMR
 *   bun run dev --dist     # serve the already-built dist/ folder (preview)
 */
import { join } from "node:path";
import index from "../index.html";

const PORT = Number(process.env.PORT ?? 3000);
const serveDist = process.argv.includes("--dist");

if (serveDist) {
  // Preview the production build straight off disk.
  const distDir = join(import.meta.dir, "..", "dist");
  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(join(distDir, path));
      if (await file.exists()) return new Response(file);
      // SPA-style fallback to index.html
      return new Response(Bun.file(join(distDir, "index.html")));
    },
  });
  console.log(`🍋 Lemonade Lane (dist preview) → ${server.url}`);
} else {
  const server = Bun.serve({
    port: PORT,
    development: { hmr: true, console: true },
    routes: {
      "/": index,
    },
  });
  console.log(`🍋 Lemonade Lane (dev) → ${server.url}`);
}
