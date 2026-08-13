import esbuild from "esbuild";
import process from "process";

const prod = process.argv.includes("production");

await esbuild.build({
  banner: {
    js: "/* Bondie-Docferry Obsidian plugin */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian"],
  format: "cjs",
  logLevel: "info",
  minify: prod,
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  target: "es2018",
  treeShaking: true,
});
