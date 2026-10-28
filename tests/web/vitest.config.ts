import { defineConfig } from "vitest/config";
import * as path from "node:path";

const web = path.resolve(__dirname, "../../apps/web");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^app\//, replacement: web + "/app/" },
      { find: /^lib\//, replacement: web + "/lib/" },
      // The app's own `@/…` imports, as its tsconfig resolves them.
      { find: /^@\//, replacement: web + "/" },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // The bootstrap suite runs the real script four times over a stand-in
    // tenant: a few seconds, not vitest's default 5.
    testTimeout: 60_000,
  },
});
