import { createInterface } from "node:readline"
import { writeFileSync } from "node:fs"
import { StorageReader } from "../storage/StorageReader.js"
import type { Exchange } from "../types/index.js"

export function listSessions(reader: StorageReader): void {
  const sessions = reader.listSessions()
  if (sessions.length === 0) {
    console.log("No sessions found.")
    return
  }
  for (const s of sessions) {
    const d = new Date(s.createdAt)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const h = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    const date = `${y}-${mo}-${day} ${h}:${mi}`
    const id = s.id.length > 8 ? s.id.slice(0, 8) : s.id
    const excLabel = s.exchangeCount === 1 ? "exchange" : "exchanges"
    console.log(`  ${id}  ${date}  ${s.exchangeCount} ${excLabel}  ${s.cwd}`)
  }
}

export function showSession(reader: StorageReader, sessionId: string): void {
  const session = reader.getSession(sessionId)
  if (!session) {
    console.log(`Session "${sessionId}" not found.`)
    return
  }
  const exchanges = reader.getExchanges(sessionId)

  console.log(`Session: ${session.id}`)
  console.log("─".repeat(80))
  console.log(`  Created:   ${new Date(session.createdAt).toLocaleString()}`)
  console.log(`  Ended:     ${session.endedAt ? new Date(session.endedAt).toLocaleString() : "active"}`)
  console.log(`  CWD:       ${session.cwd}`)
  console.log(`  Git:       ${session.gitBranch ?? "-"} @ ${(session.gitCommit ?? "-").slice(0, 7)}`)
  console.log(`  Hostname:  ${session.hostname ?? "-"}`)
  console.log(`  Exchanges: ${session.exchangeCount}`)
  console.log()

  for (const exc of exchanges) {
    printExchange(exc)
  }
}

function printExchange(exc: Exchange): void {
  console.log(`  [${exc.id}] ${exc.provider}/${exc.model}`)
  console.log(`    start: ${new Date(exc.timestampStart).toLocaleString()}`)
  if (exc.latencyMs != null) console.log(`    latency: ${exc.latencyMs}ms`)
  if (exc.usage) {
    console.log(`    tokens: ${exc.usage.totalTokens ?? "?"} (prompt: ${exc.usage.promptTokens}, completion: ${exc.usage.completionTokens})`)
  }
  if (exc.tools && exc.tools.length > 0) {
    console.log(`    tools: ${exc.tools.map((t) => t.name).join(", ")}`)
  }
  if (exc.response) {
    const preview = exc.response.text.slice(0, 120).replace(/\n/g, " ")
    console.log(`    response: "${preview}${exc.response.text.length > 120 ? "..." : ""}"`)
  }
  console.log()
}

export function printStats(reader: StorageReader): void {
  const all = reader.getAllExchanges()
  if (all.length === 0) {
    console.log("No data.")
    return
  }

  const totalTokens = all.reduce((sum, e) => sum + (e.usage?.totalTokens ?? 0), 0)
  const totalCost = all.reduce((sum, e) => sum + (e.usage?.costUsd ?? 0), 0)
  const modelMap = new Map<string, number>()
  const providerMap = new Map<string, number>()

  for (const e of all) {
    const key = `${e.provider}/${e.model}`
    modelMap.set(key, (modelMap.get(key) ?? 0) + 1)
    providerMap.set(e.provider, (providerMap.get(e.provider) ?? 0) + 1)
  }

  console.log("Stats:")
  console.log("─".repeat(80))
  console.log(`  Total exchanges:     ${all.length}`)
  console.log(`  Total tokens:        ${totalTokens.toLocaleString()}`)
  console.log(`  Total cost (USD):    $${totalCost.toFixed(4)}`)
  console.log(`  Avg tokens/exchange: ${Math.round(totalTokens / all.length).toLocaleString()}`)
  console.log()

  console.log("  By provider:")
  for (const [provider, count] of providerMap) {
    console.log(`    ${provider}: ${count}`)
  }
  console.log()

  console.log("  By model:")
  for (const [model, count] of modelMap) {
    console.log(`    ${model}: ${count}`)
  }
  console.log()
}

export function searchExchanges(reader: StorageReader, query: string): void {
  const all = reader.getAllExchanges()
  const lowerQuery = query.toLowerCase()
  const matches = all.filter((e) => {
    const messages = JSON.stringify(e.request.messages).toLowerCase()
    const response = e.response?.text.toLowerCase() ?? ""
    return messages.includes(lowerQuery) || response.includes(lowerQuery)
  })

  if (matches.length === 0) {
    console.log(`No matches for "${query}".`)
    return
  }

  console.log(`Found ${matches.length} matches for "${query}":`)
  console.log("─".repeat(80))
  for (const exc of matches) {
    printExchange(exc)
  }
}

export async function clearHistory(reader: StorageReader, spec: string): Promise<void> {
  const target = reader.resolveSpecTarget(spec)
  if (!target) {
    console.log(`Invalid spec "${spec}". Use all, YYYY, YYYY-MM, or YYYY-MM-DD.`)
    return
  }

  const preview = reader.countSessionsInTarget(target)
  if (preview === 0) {
    console.log(`Nothing to clear for "${spec}".`)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Delete ${preview} session(s)? (y/N) `, resolve)
  })
  rl.close()

  if (answer.toLowerCase() !== "y") {
    console.log("Cancelled.")
    return
  }

  const count = reader.clearHistory(spec)
  console.log(`Deleted ${count} session(s).`)
}

export function report(reader: StorageReader, spec: string): void {
  const target = reader.resolveSpecTarget(spec)
  if (!target) {
    console.log(`Invalid spec "${spec}". Use all, YYYY, YYYY-MM, or YYYY-MM-DD.`)
    return
  }

  const allSessions = reader.listSessions()
  const sessions = spec === "all"
    ? allSessions
    : allSessions.filter((s) => {
        const d = new Date(s.createdAt)
        const parts = spec.split("-")
        if (parts[0] && String(d.getFullYear()) !== parts[0]) return false
        if (parts[1] && String(d.getMonth() + 1).padStart(2, "0") !== parts[1]) return false
        if (parts[2] && String(d.getDate()).padStart(2, "0") !== parts[2]) return false
        return true
      })

  if (sessions.length === 0) {
    console.log("No data for the given period.")
    return
  }

  const exchanges: Exchange[] = []
  for (const s of sessions) {
    exchanges.push(...reader.getExchanges(s.id))
  }

  const html = generateHtmlReport(sessions, exchanges, spec)
  const filename = `flight-report-${spec === "all" ? "all" : spec}.html`
  writeFileSync(filename, html, "utf-8")
  console.log(`Report saved to ${filename}`)
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function generateHtmlReport(sessions: import("../types/index.js").Session[], exchanges: import("../types/index.js").Exchange[], spec: string): string {
  const totalTokens = exchanges.reduce((s, e) => s + (e.usage?.totalTokens ?? 0), 0)
  const totalCost = exchanges.reduce((s, e) => s + (e.usage?.costUsd ?? 0), 0)
  const totalExchanges = exchanges.length
  const totalSessions = sessions.length
  const avgTokens = totalExchanges > 0 ? Math.round(totalTokens / totalExchanges) : 0

  const providerMap = new Map<string, { count: number; tokens: number; cost: number }>()
  const modelMap = new Map<string, { count: number; tokens: number; cost: number }>()
  const dayMap = new Map<string, number>()

  for (const e of exchanges) {
    const p = e.provider
    const m = `${e.provider}/${e.model}`
    const day = e.timestampStart.slice(0, 10)

    providerMap.set(p, providerMap.get(p) ?? { count: 0, tokens: 0, cost: 0 })
    providerMap.get(p)!.count++
    providerMap.get(p)!.tokens += e.usage?.totalTokens ?? 0
    providerMap.get(p)!.cost += e.usage?.costUsd ?? 0

    modelMap.set(m, modelMap.get(m) ?? { count: 0, tokens: 0, cost: 0 })
    modelMap.get(m)!.count++
    modelMap.get(m)!.tokens += e.usage?.totalTokens ?? 0
    modelMap.get(m)!.cost += e.usage?.costUsd ?? 0

    dayMap.set(day, (dayMap.get(day) ?? 0) + 1)
  }

  const sortedProviders = [...providerMap.entries()].sort((a, b) => b[1].count - a[1].count)
  const sortedModels = [...modelMap.entries()].sort((a, b) => b[1].count - a[1].count)
  const sortedDays = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const maxProviderCount = sortedProviders[0]?.[1].count ?? 1
  const maxDayCount = sortedDays[0]?.[1] ?? 1
  const maxModelCount = sortedModels[0]?.[1].count ?? 1

  const barColors = ["#6366f1", "#8b5cf6", "#a78bfa", "#c084fc", "#e879f9", "#f472b6", "#fb7185", "#f87171", "#fbbf24", "#34d399", "#22d3ee", "#60a5fa"]

  const now = new Date()
  const genDate = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flight Recorder Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; color: #f8fafc; }
  .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: #1e293b; border-radius: 0.75rem; padding: 1.25rem; }
  .card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .card-value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; color: #f8fafc; }
  .card-value.green { color: #34d399; }
  .card-value.blue { color: #60a5fa; }
  .card-value.purple { color: #a78bfa; }
  .card-value.pink { color: #f472b6; }
  .card-value.yellow { color: #fbbf24; }
  .card-value.red { color: #f87171; }
  h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; margin-top: 2rem; color: #f1f5f9; }
  .chart-wrap { background: #1e293b; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; overflow-x: auto; }
  .chart-wrap svg { display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { text-align: left; padding: 0.5rem 0.75rem; color: #64748b; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #334155; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e293b; }
  tr:last-child td { border-bottom: none; }
  .bar { height: 1.5rem; border-radius: 0.25rem; min-width: 2px; }
  .bar-label { display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.8125rem; }
  .bar-row { margin-bottom: 0.75rem; }
  .recent { background: #1e293b; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; }
  .recent-item { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #1e293b; font-size: 0.8125rem; }
  .recent-item:last-child { border-bottom: none; }
  .recent-id { color: #94a3b8; font-family: "SF Mono", Menlo, monospace; }
  .recent-date { color: #64748b; }
  .recent-exc { color: #34d399; }
  .footer { text-align: center; color: #475569; font-size: 0.75rem; margin-top: 3rem; }
</style>
</head>
<body>
<div class="container">
  <h1>OpenCode Flight Recorder</h1>
  <p class="subtitle">Usage report for <strong>${esc(spec === "all" ? "all time" : spec)}</strong> &middot; generated ${genDate}</p>

  <div class="cards">
    <div class="card"><div class="card-label">Sessions</div><div class="card-value blue">${totalSessions}</div></div>
    <div class="card"><div class="card-label">Exchanges</div><div class="card-value green">${totalExchanges}</div></div>
    <div class="card"><div class="card-label">Total Tokens</div><div class="card-value purple">${totalTokens.toLocaleString()}</div></div>
    <div class="card"><div class="card-label">Avg Tokens</div><div class="card-value pink">${avgTokens.toLocaleString()}</div></div>
    <div class="card"><div class="card-label">Total Cost</div><div class="card-value yellow">$${totalCost.toFixed(4)}</div></div>
  </div>

  <h2>Providers</h2>
  <div class="chart-wrap">
    ${sortedProviders.map(([name, data], i) => {
      const pct = Math.round((data.count / maxProviderCount) * 100)
      const color = barColors[i % barColors.length]
      return `<div class="bar-row">
        <div class="bar-label"><span>${esc(name)}</span><span>${data.count} &middot; ${data.tokens.toLocaleString()} tok &middot; $${data.cost.toFixed(4)}</span></div>
        <div class="bar" style="width:${pct}%;background:${color}"></div>
      </div>`
    }).join("\n    ")}
  </div>

  <h2>Models</h2>
  <div class="chart-wrap">
    <table>
      <tr><th>Model</th><th>Exchanges</th><th>Tokens</th><th>Cost</th><th></th></tr>
      ${sortedModels.map(([name, data], i) => {
        const pct = Math.round((data.count / maxModelCount) * 100)
        const color = barColors[i % barColors.length]
        return `<tr>
          <td>${esc(name)}</td>
          <td>${data.count}</td>
          <td>${data.tokens.toLocaleString()}</td>
          <td>$${data.cost.toFixed(4)}</td>
          <td><svg width="120" height="12"><rect x="0" y="0" width="${pct}" height="12" rx="3" fill="${color}"/></svg></td>
        </tr>`
      }).join("\n    ")}
    </table>
  </div>

  ${sortedDays.length > 0 ? `<h2>Daily Activity</h2>
  <div class="chart-wrap">
    <svg width="${Math.max(sortedDays.length * 60, 300)}" height="220" viewBox="0 0 ${Math.max(sortedDays.length * 60, 300)} 220" xmlns="http://www.w3.org/2000/svg">
      <style>
        .axis { stroke: #334155; stroke-width: 1; }
        .grid { stroke: #1e293b; stroke-width: 1; }
        .bar-rect { fill: #6366f1; rx: 3; }
        .bar-label { fill: #94a3b8; font-size: 10px; text-anchor: middle; }
        .bar-val { fill: #e2e8f0; font-size: 10px; text-anchor: middle; }
      </style>
      <line x1="40" y1="190" x2="${Math.max(sortedDays.length * 60, 280)}" y2="190" class="axis"/>
      <line x1="40" y1="20" x2="40" y2="190" class="axis"/>
      ${[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = 190 - (frac * 160)
        return `<line x1="38" y1="${y}" x2="40" y2="${y}" class="grid"/><text x="36" y="${y + 4}" fill="#64748b" font-size="9" text-anchor="end">${Math.round(frac * maxDayCount)}</text>`
      }).join("\n      ")}
      ${sortedDays.map(([day, count], i) => {
        const x = 50 + i * 60
        const h = (count / maxDayCount) * 160
        const y = 190 - h
        const short = day.slice(5)
        return `<rect x="${x}" y="${y}" width="32" height="${h}" class="bar-rect"/><text x="${x + 16}" y="203" class="bar-label">${esc(short)}</text><text x="${x + 16}" y="${y - 5}" class="bar-val">${count}</text>`
      }).join("\n      ")}
    </svg>
  </div>` : ""}

  <h2>Recent Sessions</h2>
  <div class="recent">
    ${sessions.slice(0, 10).map((s) => {
      const d = new Date(s.createdAt)
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      const h = String(d.getHours()).padStart(2, "0")
      const mi = String(d.getMinutes()).padStart(2, "0")
      const date = y + "-" + mo + "-" + dd + " " + h + ":" + mi
      const id = s.id.length > 12 ? s.id.slice(0, 12) + "…" : s.id
      const exc = s.exchangeCount + " exchange" + (s.exchangeCount !== 1 ? "s" : "")
      return "<div class=\"recent-item\"><span class=\"recent-id\">" + esc(id) + "</span><span class=\"recent-date\">" + date + "</span><span class=\"recent-exc\">" + exc + "</span><span>" + esc(s.cwd) + "</span></div>"
    }).join("\n    ")}
  </div>

  <div class="footer">Generated by OpenCode Flight Recorder</div>
</div>
</body>
</html>`
}

export function exportData(reader: StorageReader, sessionId?: string): void {
  const all = sessionId
    ? reader.getExchanges(sessionId)
    : reader.getAllExchanges()

  const sessions = sessionId
    ? [reader.getSession(sessionId)].filter(Boolean)
    : reader.listSessions()

  const output = { sessions, exchanges: all }
  console.log(JSON.stringify(output, null, 2))
}
