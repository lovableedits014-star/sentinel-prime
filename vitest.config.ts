import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      // Foco em código de resolução de cliente / sincronização — onde os bugs
      // de "tela em branco" / "dados do gerente errado" aparecem.
      include: [
        "src/hooks/useActiveClientId.ts",
        "src/lib/resolveClientId.ts",
        "src/lib/client-telemetry.ts",
        "src/components/RequireClient.tsx",
        "src/components/SuperAdminClientSwitcher.tsx",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
