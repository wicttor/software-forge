# Setup log

Run from `forge/`:

```
npx shadcn@latest init --preset b6Xthn9aW9 --base radix --template vite --pointer --name dashboard -y --no-monorepo
```

Key output:

```
✔ Creating a new Vite project.
✔ Writing components.json.
✔ Checking registry.
✔ Installing dependencies.
✔ Created 2 files: src/components/ui/button.tsx, src/lib/utils.ts
✔ Updating src/index.css
Project initialization completed.
```

Then, from `forge/dashboard/`:

```
npx shadcn@latest add card badge sheet scroll-area separator tooltip -y
```

Result: card, badge, sheet, scroll-area, separator, tooltip added under `src/components/ui/`.
Generated style: radix-lyra, baseColor olive, icon library remixicon.
`npm run build` passes (tsc -b + vite build).
