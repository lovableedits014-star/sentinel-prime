// @lovable.dev/vite-tanstack-config provides the Lovable preset.
// We disable the Cloudflare plugin and switch the TanStack Start target
// to "node-server" so the build produces a standalone Node.js server
// suitable for VPS / Docker / Easypanel deployment.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    target: "node-server",
    server: { entry: "server" },
  },
});
