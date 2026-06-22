import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
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
    const entry = this.listAllEntries().find((e) => e.session.id === sessionId)
    if (!entry) return []
    const exchangePath = join(entry.dir, "exchanges.jsonl")
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
      const exchanges = this.getExchanges(entry.session.id)
      all.push(...exchanges)
    }
    return all.sort(
      (a, b) => new Date(a.timestampStart).getTime() - new Date(b.timestampStart).getTime(),
    )
  }
}
