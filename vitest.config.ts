import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Generated trial code must never be collected as this repo's tests. The
    // original list named only `runs/`; `runs-crossmodel/` and the drift cells
    // arrived later and were being collected, so four generated files were
    // failing the suite with "No test suite found". Excluded by shape rather
    // than by name so the next batch of trial output is covered too.
    exclude: [
      "node_modules/**",
      "**/node_modules/**",
      "app/**",
      "experiments/*/runs/**",
      "experiments/*/runs-*/**",
      "experiments/*/results/**",
      "experiments/*/results-*/**",
      "experiments/*/baseline/**",
    ],
  },
});
