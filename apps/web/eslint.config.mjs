import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Upstream's rule set — its .eslintrc.json extends `next/core-web-vitals`
// and nothing else — in eslint-config-next 16's flat form (Next.js 16 removed
// `next lint` and the legacy config).
const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Workers build's output and wrangler's local state.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
