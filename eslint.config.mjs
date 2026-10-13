import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Must come before the TypeScript config, which turns off base rules
  // (no-undef, no-unused-vars) that don't understand TypeScript.
  js.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react's version auto-detection uses context.getFilename(),
    // which ESLint 10 removed; pin the version so detection is skipped.
    settings: { react: { version: "19" } },
    languageOptions: { ecmaVersion: "latest" },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
]);

export default eslintConfig;
