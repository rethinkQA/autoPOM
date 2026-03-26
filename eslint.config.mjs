import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.angular/**",
      "**/playwright-report/**",
      "**/test-results/**",
      // Generated docs
      "framework/docs/**",
      // React and Next.js apps have their own framework-specific ESLint configs
      // (apps/react-app/eslint.config.js, apps/nextjs-app/eslint.config.mjs)
      // and are linted separately via their own npm scripts.  Including them
      // here would cause rule conflicts with eslint-plugin-react / eslint-config-next.
      "apps/react-app/**",
      "apps/nextjs-app/**",
      // Framework-specific file formats that need dedicated parsers.
      // The .ts/.js files in these apps ARE covered by this root config.
      "**/*.vue",
      "**/*.svelte",
    ],
  },

  // ── JavaScript files ─────────────────────────────────────
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ── TypeScript files ─────────────────────────────────────
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ── Test files — relax rules for test mocks/stubs ────────
  {
    files: ["**/*.spec.ts", "**/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
