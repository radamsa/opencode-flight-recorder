import { mkdir, writeFile, appendFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Exchange, Session } from "../types/index.js"

const DEFAULT_BASE = join(homedir(), ".opencode-flight-recorder", "sessions")

export class JsonlWriter {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_BASE
  }
  private sessionDir: string = ""
  private exchangePath: string = ""
  private exchangeCount: number = 0
  private closed: boolean = false

  async init(sessionId: string, meta: Partial<Session>): Promise<void> {
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    this.sessionDir = join(this.baseDir, yyyy, mm, dd, sessionId)
    this.exchangePath = join(this.sessionDir, "exchanges.jsonl")
    this.closed = false

    await mkdir(this.sessionDir, { recursive: true })

    const session: Session = {
      id: sessionId,
      createdAt: now.toISOString(),
      cwd: meta.cwd ?? "",
      gitBranch: meta.gitBranch,
      gitCommit: meta.gitCommit,
      hostname: meta.hostname,
      os: meta.os,
      exchangeCount: 0,
    }

    await writeFile(join(this.sessionDir, "session.json"), JSON.stringify(session, null, 2))
  }

  async appendExchange(exchange: Exchange): Promise<void> {
    if (this.closed) return
    await appendFile(this.exchangePath, JSON.stringify(exchange) + "\n")
    this.exchangeCount++
  }

  async finalize(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const sessionPath = join(this.sessionDir, "session.json")
    const raw = await import("node:fs/promises").then(m => m.readFile(sessionPath, "utf-8"))
    const session = JSON.parse(raw) as Session
    session.endedAt = new Date().toISOString()
    session.exchangeCount = this.exchangeCount
    await writeFile(sessionPath, JSON.stringify(session, null, 2))
  }

  async cleanup(): Promise<void> {
    if (!this.closed) {
      await this.finalize()
    }
  }
}
