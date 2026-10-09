# Factory Dashboard

Read-only Vite + React + shadcn (Radix) view of the software factory: jobs appear as cards moving
through the loop stages, each review round is a row of reviewer chips, `needs-human` jobs stand
out in red, and clicking a card opens a side panel with its Markdown/JSON files.

## Run

```
npm install
npm run dev                      # http://localhost:5173, shows examples/dry-run (FACTORY_REPO=<project> to change)
npm run build                    # writes dist/, which the software-forge package serves
```

In a project, use `software-forge dashboard` (serves `dist/` with `src/dashboard-server.mjs`).

The board is polled every 2 seconds; if a poll fails the last good state stays on screen and an
error indicator appears in the header.

## API (served by a small Vite plugin in dev and preview)

- `GET /api/board` returns `factory/board.json`; `?source=sample` returns
  `dashboard/fixtures/sample-board.json`.
- `GET /api/file?path=<repo-relative path>` returns raw text of a `.md` or `.json` file, only if it
  resolves inside `factory/jobs/` or `docs/` (anything else, including `..` traversal, gets 403).
  Responses are sent with no-cache headers.

## Read-only

The dashboard has no write endpoints and no actions. All state changes go through
`software-forge`.

## Sample mode

Use the toggle in the header, or open `http://localhost:5173/?source=sample`, to view the fixture
board instead of the live one.
