import * as esbuild from "esbuild";
import { cpSync } from "node:fs";

const watch = process.argv.includes("--watch");

// Copy static files
cpSync("client/index.html", "dist/public/index.html");
cpSync("client/styles", "dist/public/styles", { recursive: true });
cpSync("client/styles.css", "dist/public/styles.css");
cpSync("client/icons", "dist/public/icons", { recursive: true });

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["client/main.ts", "client/detail.ts"],
  bundle: true,
  outdir: "dist/public",
  format: "esm",
  target: "es2022",
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("esbuild watching...");
} else {
  await esbuild.build(config);
  console.log("esbuild done.");
}
