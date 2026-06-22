# Project Rules

## Date & Time

| Context | Format | Example |
|---------|--------|---------|
| Display (CLI, reports) | `YYYY-MM-DD HH:mm` (24h) | `2026-06-22 14:30` |
| ISO storage (JSON, JSONL) | ISO 8601 | `2026-06-22T14:30:00.000Z` |
| Directory structure | `YYYY/MM/DD` | `2026/06/22/` |

Use `fmtDate(iso)` helper from `src/cli/commands.ts` for display formatting.
Never use `toLocaleString()` for dates — only for numbers (token counts).

## Logging

- Error prefix: `[FlightRecorder]` in `console.error()`
- No debug/info logging in production code
- Let errors propagate to the plugin runner; only catch to add context prefix

## Code Style

- **Language:** TypeScript, strict mode
- **Modules:** ES modules (`"type": "module"`), imports include `.js` extension
- **Naming:**
  - `camelCase` — variables, functions, methods, parameters
  - `PascalCase` — classes, types, interfaces, file/module names
  - `UPPER_CASE` — constants (`DEFAULT_BASE`, `FLUSH_INTERVAL`)
- **Exports:** named exports (`export function`, `export class`); no `export default`
- **No comments** in implementation code — code should be self-documenting
- **No semicolons** — project uses ASI style

## Architecture

- **Plugin:** read-only observer — never modify prompts, responses, or parameters
- **Storage:** append-only JSONL, never overwrite existing exchange data
- **SessionManager** manages lifecycle: `start(sessionId)` → events → `end()`
- **Session ID** comes from OpenCode (`input.sessionID`), not generated locally
- **Session restore:** if session directory exists on `init()`, read and merge `session.json` instead of overwriting; append to existing `exchanges.jsonl`

## File Structure

```
src/
├── capture/        ExchangeBuilder — build exchange objects from fragments
├── cli/            CLI entrypoint and command handlers
├── plugin/         OpenCode plugin entrypoint (event-based hooks)
├── report/         HTML report template generation
├── storage/        JsonlWriter, SessionManager, StorageReader
└── types/          TypeScript type definitions
```

## Testing

- **Framework:** Vitest
- **Run:** `npm test` (vitest run)
- **Coverage:** test all storage classes, capture logic, and CLI edge cases
- **Temp dirs:** use `mkdtempSync` for test isolation; clean up in `afterEach`

## Build & Deploy

- **Build:** `npm run build` (tsc), output to `dist/`
- **Install:** `./install.sh` — copies `dist/` to `~/.config/opencode/plugins/flight-recorder-dist/`, writes entry `.js` file
- **Entry file** (`flight-recorder.js`) is a writable bridge — must stay in sync with `src/plugin/index.ts`
- Plugin auto-loaded from `~/.config/opencode/plugins/` — no `plugin` array entry needed

## CLI & npm

- **npm intercepts `--` flags** — `--json`, `--force`, `--yaml` and short flags like `-j` are consumed by `npm run` before reaching the script
- **Workaround:** use positional subcommands instead of flags (e.g. `search json <query>`), or use `--` separator: `npm run flight -- search --json README.md`
- **Rule:** never add `--` prefixed flags to CLI commands — use subcommands like `json`, `yaml`, `force` as positional args

## Git

- Commit after each completed task
- Concise, descriptive messages (English or Russian)
- Keep commits focused on one logical change
