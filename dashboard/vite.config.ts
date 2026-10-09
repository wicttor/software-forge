import path from "node:path"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { createApiHandler } from "../src/dashboard-server.mjs"

// The same read-only API the packaged dashboard server uses (src/dashboard-server.mjs).
// FORGE_REPO picks the project to show; the default is the bundled dry-run example.
const repoRoot = path.resolve(process.env.FORGE_REPO ?? path.join(import.meta.dirname, "../examples/dry-run"))
const apiHandler = createApiHandler(repoRoot)

function forgeApi(): Plugin {
  return {
    name: "forge-api",
    configureServer(server) {
      server.middlewares.use(apiHandler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiHandler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), forgeApi()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
