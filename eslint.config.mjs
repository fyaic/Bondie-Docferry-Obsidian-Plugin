import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          acronyms: ["API", "URL"],
          brands: ["Account Center", "Bondie", "Bondie-Docferry", "DocFerry", "Obsidian"],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.mts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.tests.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/unbound-method": "off",
      "obsidianmd/no-global-this": "off",
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
  {
    files: ["*.config.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
]);
