import { mkdir, writeFile, appendFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Exchange, Session } from "../types/index.js"

const DEFAULT_BASE = join(homedir(), ".opencode-flight-recorder", "sessions")
const FLUSH_INTERVAL = 10

export class JsonlWriter {
  private baseDir: string
  private sessionDir: string = ""
  private exchangePath: string = ""
  private semanticPath: string = ""
  private exchangeCount: number = 0
  private closed: boolean = false
  private flushCounter: number = 0

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_BASE
  }

  async init(sessionId: string, meta: Partial<Session>): Promise<void> {
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    this.sessionDir = join(this.baseDir, yyyy, mm, dd, sessionId)
    this.exchangePath = join(this.sessionDir, "exchanges.jsonl")
    this.semanticPath = join(this.sessionDir, "semantic.jsonl")
    this.closed = false
    this.flushCounter = 0

    await mkdir(this.sessionDir, { recursive: true })

    const sessionPath = join(this.sessionDir, "session.json")
    let session: Session
    try {
      const raw = await readFile(sessionPath, "utf-8")
      session = JSON.parse(raw) as Session
      session.cwd = meta.cwd ?? session.cwd
      session.gitBranch = meta.gitBranch ?? session.gitBranch
      session.gitCommit = meta.gitCommit ?? session.gitCommit
      session.hostname = meta.hostname ?? session.hostname
      session.os = meta.os ?? session.os
      delete (session as any).endedAt
      this.exchangeCount = session.exchangeCount
    } catch {
      session = {
        id: sessionId,
        createdAt: now.toISOString(),
        cwd: meta.cwd ?? "",
        gitBranch: meta.gitBranch,
        gitCommit: meta.gitCommit,
        hostname: meta.hostname,
        os: meta.os,
        exchangeCount: 0,
      }
    }
    await writeFile(sessionPath, JSON.stringify(session, null, 2))
  }

  async appendExchange(exchange: Exchange): Promise<void> {
    if (this.closed) return
    try {
      await appendFile(this.exchangePath, JSON.stringify(exchange) + "\n")
      this.exchangeCount++
      this.flushCounter++
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException
      if (e.code === "ENOENT") {
        try {
          await mkdir(this.sessionDir, { recursive: true })
          await appendFile(this.exchangePath, JSON.stringify(exchange) + "\n")
          this.exchangeCount++
          this.flushCounter++
          return
        } catch {
          // fall through to error log
        }
      }
      console.error("[FlightRecorder] Failed to write exchange:", err)
    }
  }

  async finalize(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      // ensure directory exists (may have been deleted by clear)
      await mkdir(this.sessionDir, { recursive: true })
      const sessionPath = join(this.sessionDir, "session.json")
      let session: Session
      try {
        const raw = await readFile(sessionPath, "utf-8")
        session = JSON.parse(raw) as Session
      } catch {
        session = { id: "", createdAt: new Date().toISOString(), cwd: "", exchangeCount: 0 }
      }
      session.endedAt = new Date().toISOString()
      session.exchangeCount = this.exchangeCount
      await writeFile(sessionPath, JSON.stringify(session, null, 2))
    } catch (err) {
      console.error("[FlightRecorder] Failed to finalize session:", err)
    }
  }

  async cleanup(): Promise<void> {
    if (!this.closed) {
      await this.finalize()
    }
  }
}
