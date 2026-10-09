import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { Board, Job, Reviews } from "@/types"

const MAIN = ["brainstorm", "planning", "plan-approval", "building", "review", "approval", "merge-approval"]
const TERMINAL = ["needs-human", "merged", "committed", "failed"]

const CHIP: Record<string, string> = {
  PASS: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  CHANGES: "bg-amber-500/15 text-amber-700 border-amber-500/50 dark:text-amber-300",
  pending: "bg-transparent text-muted-foreground border-border",
  skipped: "bg-transparent text-muted-foreground/70 border-dashed border-muted-foreground/40",
  error: "bg-red-500/15 text-red-700 border-red-500/50 dark:text-red-300",
}

function Chips({ label, reviews }: { label: string; reviews: Reviews }) {
  const entries = Object.entries(reviews ?? {})
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-6 text-[10px] font-medium text-muted-foreground">{label}</span>
      {entries.length === 0 && <span className="text-[10px] text-muted-foreground">no reviews yet</span>}
      {entries.map(([k, v]) => (
        <span
          key={k}
          title={`${k}: ${v}`}
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px] leading-none",
            CHIP[v] ?? "border-border text-muted-foreground",
          )}
        >
          {k}
          <span className="ml-1 opacity-70">{v}</span>
        </span>
      ))}
    </div>
  )
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const rounds = job.rounds ?? []
  const hasCurrent = rounds.some((r) => r.round === job.round)
  const showCurrent = !hasCurrent && job.reviews && Object.keys(job.reviews).length > 0
  const human = job.stage === "needs-human"
  const mergeAp = job.stage === "merge-approval"
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className={cn(
        "cursor-pointer transition hover:shadow-md",
        human && "border-2 border-destructive bg-destructive/5 ring-2 ring-destructive/30",
        mergeAp && "border-primary/60 bg-primary/5",
        job.stage === "failed" && "border-destructive/50",
      )}
    >
      <CardHeader>
        <CardTitle className="flex flex-col gap-0.5 text-sm">
          <span className="font-mono text-[10px] text-muted-foreground">{job.id}</span>
          <span>{job.title ?? job.id}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {human && <Badge variant="destructive">Needs human</Badge>}
          {mergeAp && <Badge>Awaiting merge approval</Badge>}
          {job.risk && <Badge variant="outline">risk: {job.risk}</Badge>}
          {job.complexity && <Badge variant="secondary">{job.complexity}</Badge>}
          <Badge variant="outline">round {job.round ?? 0}</Badge>
          {job.dryRun && <Badge variant="secondary" className="border-dashed">dry-run</Badge>}
        </div>
        {human && job.blocker && <p className="text-xs font-medium text-destructive">{job.blocker}</p>}
        {(rounds.length > 0 || showCurrent) && (
          <div className="flex flex-col gap-1">
            {rounds.map((r) => (
              <Chips key={r.round} label={`R${r.round}`} reviews={r.reviews} />
            ))}
            {showCurrent && <Chips label={`R${job.round ?? "?"}`} reviews={job.reviews!} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilePanel({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const [file, setFile] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [err, setErr] = useState("")
  const jobId = job?.id
  useEffect(() => {
    setFile(null); setContent(""); setErr("")
  }, [jobId])
  useEffect(() => {
    if (!file) return
    let live = true
    setContent(""); setErr("")
    fetch(`/api/file?path=${encodeURIComponent(file)}`, { cache: "no-store" })
      .then(async (r) => {
        const t = await r.text()
        if (!live) return
        if (!r.ok) setErr(`${r.status} ${t}`)
        else setContent(t)
      })
      .catch((e) => live && setErr(String(e)))
    return () => { live = false }
  }, [file])
  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{job?.title ?? job?.id}</SheetTitle>
          <SheetDescription>
            {job?.id} - {job?.stage}
            {job?.branch ? ` - ${job.branch}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
          {job?.blocker && <p className="text-sm text-destructive">{job.blocker}</p>}
          <div className="flex flex-wrap gap-1">
            {(job?.files ?? []).length === 0 && <span className="text-sm text-muted-foreground">No files yet.</span>}
            {(job?.files ?? []).map((f) => (
              <button
                key={f}
                onClick={() => setFile(f)}
                className={cn(
                  "rounded border px-2 py-1 font-mono text-xs hover:bg-muted",
                  f === file && "bg-muted font-semibold",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <Separator />
          <ScrollArea className="min-h-0 flex-1 rounded border">
            <pre className="p-3 font-mono text-xs whitespace-pre-wrap">
              {err ? `Could not load file: ${err}` : file ? content || "Loading..." : "Select a file."}
            </pre>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Attention({ jobs, onOpen }: { jobs: Job[]; onOpen: (j: Job) => void }) {
  if (jobs.length === 0) return null
  return (
    <div className="flex flex-wrap items-start gap-2 border-b bg-destructive/5 px-4 py-2">
      <span className="self-center text-xs font-semibold tracking-wide uppercase">Attention</span>
      {jobs.map((j) => {
        const human = j.stage === "needs-human"
        return (
          <Card
            key={j.id}
            size="sm"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(j)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(j)}
            className={cn(
              "w-64 max-w-full cursor-pointer flex-row items-center gap-2 px-3 py-2 transition hover:shadow-md",
              human ? "border-destructive bg-destructive/10" : "border-primary/60 bg-primary/5",
            )}
          >
            <Badge variant={human ? "destructive" : "secondary"} className="shrink-0">
              {human ? "Needs human" : "Merge approval"}
            </Badge>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-[10px] text-muted-foreground">{j.id}</span>
              <span className="truncate text-xs font-medium" title={j.title ?? j.id}>
                {j.title ?? j.id}
              </span>
              {j.blocker && (
                <span className="truncate text-[10px] text-destructive" title={j.blocker}>
                  {j.blocker}
                </span>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Column({ name, jobs, onOpen }: { name: string; jobs: Job[]; onOpen: (j: Job) => void }) {
  return (
    <section
      className={cn(
        "flex w-full shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2 md:w-[240px] md:min-w-[240px]",
        name === "needs-human" && "bg-destructive/10",
      )}
    >
      <h2 className="flex items-center justify-between px-1 text-xs font-semibold tracking-wide uppercase">
        {name}
        <span className="text-muted-foreground">{jobs.length}</span>
      </h2>
      {jobs.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">empty</p>}
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} onOpen={() => onOpen(j)} />
      ))}
    </section>
  )
}

export function App() {
  const [sample, setSample] = useState(() => new URLSearchParams(location.search).get("source") === "sample")
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const toggle = () => {
    const next = !sample
    setSample(next)
    const u = new URL(location.href)
    if (next) u.searchParams.set("source", "sample")
    else u.searchParams.delete("source")
    history.replaceState(null, "", u)
  }

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/board${sample ? "?source=sample" : ""}`, { cache: "no-store" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as Board
      if (!data || !Array.isArray(data.jobs)) throw new Error("invalid board")
      setBoard(data); setError(null); setFetchedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [sample])

  useEffect(() => {
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [load])

  const jobs = board?.jobs ?? []
  const known = new Set([...MAIN, ...TERMINAL])
  const other = jobs.filter((j) => !known.has(j.stage))
  const cols: string[] = [
    ...MAIN,
    ...TERMINAL.filter((s) => jobs.some((j) => j.stage === s)),
    ...(other.length ? ["other"] : []),
  ]
  const byCol = (c: string) => (c === "other" ? other : jobs.filter((j) => j.stage === c))
  const openJob = jobs.find((j) => j.id === openId) ?? null
  const attention = [
    ...jobs.filter((j) => j.stage === "needs-human"),
    ...jobs.filter((j) => j.stage === "merge-approval"),
  ]

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Software Factory</h1>
        <Badge variant={sample ? "secondary" : "outline"}>{sample ? "sample board" : "live board"}</Badge>
        <button onClick={toggle} className="text-xs underline underline-offset-2 hover:text-primary">
          switch to {sample ? "live" : "sample"}
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {error && (
            <span title={error} className="flex items-center gap-1 text-destructive">
              <span className="size-2 rounded-full bg-destructive" /> update failed, showing last good data
            </span>
          )}
          <span>
            board: {board?.updatedAt ? new Date(board.updatedAt).toLocaleString() : "-"}
            {fetchedAt ? ` - polled ${fetchedAt.toLocaleTimeString()}` : ""}
          </span>
        </div>
      </header>
      <Attention jobs={attention} onOpen={(j) => setOpenId(j.id)} />
      <main className="flex flex-1 flex-col gap-3 overflow-x-auto p-4 md:flex-row md:items-start">
        {!board && !error && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!board && error && <p className="text-sm text-destructive">Cannot load board: {error}</p>}
        {board && cols.map((c) => <Column key={c} name={c} jobs={byCol(c)} onOpen={(j) => setOpenId(j.id)} />)}
      </main>
      <FilePanel job={openJob} onClose={() => setOpenId(null)} />
    </div>
  )
}

export default App
