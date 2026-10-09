import fs from "node:fs"
import path from "node:path"
import { resolve } from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const repoRoot = path.resolve(import.meta.dirname, "../..")

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.statusCode = status
  res.setHeader("Content-Type", type)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.end(body)
}

function inside(file: string, dir: string) {
  const rel = path.relative(dir, file)
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}

function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? "/", "http://localhost")
  if (req.method !== "GET" && req.method !== "HEAD") return next()

  if (url.pathname === "/api/board") {
    const file =
      url.searchParams.get("source") === "sample"
        ? path.join(repoRoot, "factory/fixtures/sample-board.json")
        : path.join(repoRoot, "factory/board.json")
    try {
      return send(res, 200, "application/json; charset=utf-8", fs.readFileSync(file, "utf8"))
    } catch {
      return send(res, 404, "application/json", JSON.stringify({ error: "board not found" }))
    }
  }

  if (url.pathname === "/api/file") {
    const rel = url.searchParams.get("path") ?? ""
    const resolved = path.resolve(repoRoot, rel)
    const allowedDirs = [path.join(repoRoot, "factory/jobs"), path.join(repoRoot, "docs")]
    const okExt = resolved.endsWith(".md") || resolved.endsWith(".json")
    if (!rel || rel.includes("\0") || !okExt || !allowedDirs.some((d) => inside(resolved, d))) {
      return send(res, 403, "text/plain; charset=utf-8", "forbidden")
    }
    try {
      // resolve symlinks so a link cannot escape the allowed dirs
      const real = fs.realpathSync(resolved)
      const realDirs = allowedDirs.map((d) => {
        try { return fs.realpathSync(d) } catch { return d }
      })
      if (!realDirs.some((d) => inside(real, d))) {
        return send(res, 403, "text/plain; charset=utf-8", "forbidden")
      }
      return send(res, 200, "text/plain; charset=utf-8", fs.readFileSync(real, "utf8"))
    } catch {
      return send(res, 404, "text/plain; charset=utf-8", "not found")
    }
  }
  next()
}

function factoryApi(): Plugin {
  return {
    name: "factory-api",
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), factoryApi()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
