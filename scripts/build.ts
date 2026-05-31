/**
 * Lemonade Lane — production build.
 *
 * Bundles the HTML entrypoint (+ all TS/CSS it pulls in) into a fully static
 * `dist/` folder that can be hosted anywhere or opened from disk.
 *
 *   bun run build
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(root, "index.html")],
  outdir,
  minify: true,
  sourcemap: "linked",
  target: "browser",
  naming: {
    entry: "[dir]/[name].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    asset: "assets/[name]-[hash].[ext]",
  },
});

if (!result.success) {
  console.error("❌ Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`✅ Built ${result.outputs.length} files → dist/`);
for (const out of result.outputs) {
  const rel = out.path.replace(outdir, "").replace(/^[\\/]/, "");
  console.log(`   ${rel}  (${(out.size / 1024).toFixed(1)} KB)`);
}
