import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs"
import { join, resolve, normalize, sep, dirname } from "node:path"
import { homedir } from "node:os"
import type { Session, Exchange } from "../types/index.js"

const DEFAULT_BASE = join(homedir(), ".opencode-flight-recorder", "sessions")

interface SessionEntry {
  session: Session
  dir: string
}

export class StorageReader {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = resolve(baseDir ?? DEFAULT_BASE)
  }

  private listAllEntries(): SessionEntry[] {
    if (!existsSync(this.baseDir)) return []
    const entries: SessionEntry[] = []

    const descend = (path: string, depth: number) => {
      if (depth > 3) return
      let items: string[]
      try {
        items = readdirSync(path)
      } catch {
        return
      }
      for (const item of items) {
        const full = join(path, item)
        let stat: any
        try {
          stat = readdirSync(full)
        } catch {
          continue
        }
        const sessionJson = join(full, "session.json")
        if (existsSync(sessionJson)) {
          try {
            const data = readFileSync(sessionJson, "utf-8")
            entries.push({ session: JSON.parse(data), dir: full })
          } catch {
            // skip
          }
        }
        descend(full, depth + 1)
      }
    }

    descend(this.baseDir, 0)
    return entries
  }

  listSessions(): Session[] {
    return this.listAllEntries()
      .map((e) => e.session)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  getSession(sessionId: string): Session | undefined {
    return this.listAllEntries().find((e) => e.session.id === sessionId)?.session
  }

  getExchanges(sessionId: string): Exchange[] {
    const entries = this.listAllEntries().filter((e) => e.session.id === sessionId)
    const all: Exchange[] = []
    for (const entry of entries) {
      all.push(...this.readExchangesFromDir(entry.dir))
    }
    return all
  }

  private readExchangesFromDir(dir: string): Exchange[] {
    const exchangePath = join(dir, "exchanges.jsonl")
    if (!existsSync(exchangePath)) return []
    try {
      const raw = readFileSync(exchangePath, "utf-8")
      return raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    } catch {
      return []
    }
  }

  getAllExchanges(): Exchange[] {
    const entries = this.listAllEntries()
    const all: Exchange[] = []
    for (const entry of entries) {
      all.push(...this.readExchangesFromDir(entry.dir))
    }
    return all.sort(
      (a, b) => new Date(a.timestampStart).getTime() - new Date(b.timestampStart).getTime(),
    )
  }

  resolveSpecTarget(spec: string): string | null {
    if (spec === "all") return this.baseDir

    const parts = spec.split("-").filter(Boolean)
    if (parts.length < 1 || parts.length > 3) return null
    if (!/^\d{4}$/.test(parts[0])) return null
    if (parts.length >= 2 && !/^\d{2}$/.test(parts[1])) return null
    if (parts.length >= 3 && !/^\d{2}$/.test(parts[2])) return null

    const target = normalize(join(this.baseDir, ...parts))
    const base = normalize(this.baseDir) + sep
    if (!target.startsWith(base) && target !== normalize(this.baseDir)) return null
    return target
  }

  countSessionsInTarget(target: string): number {
    return this.listAllEntries().filter((e) => e.dir.startsWith(target)).length
  }

  clearHistory(spec: string): number {
    const target = this.resolveSpecTarget(spec)
    if (!target) return 0

    const entries = this.listAllEntries().filter((e) => e.dir.startsWith(target))
    if (entries.length === 0) return 0

    for (const entry of entries) {
      rmSync(entry.dir, { recursive: true, force: true })
    }

    // clean up empty parent dirs bottom-up
    let dir = dirname(entries[0].dir)
    while (dir.startsWith(this.baseDir)) {
      try {
        const remaining = readdirSync(dir)
        if (remaining.length === 0) {
          rmSync(dir, { recursive: true, force: true })
        }
      } catch {
        // skip
      }
      dir = dirname(dir)
    }

    return entries.length
  }
}
