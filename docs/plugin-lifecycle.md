# 🧠 1. Ментальная модель плагина OpenCode

Плагин (в твоём случае Flight Recorder) должен жить внутри одного простого цикла:

```text
USER INPUT
   ↓
OpenCode runtime
   ↓
(plugins: pre-process hooks)
   ↓
LLM request build
   ↓
(plugins: request intercept)
   ↓
Provider call (OpenAI / Anthropic / etc)
   ↓
(plugins: response intercept)
   ↓
Tool execution (optional loop)
   ↓
Final response to user
   ↓
(plugins: post-response hook)
```

---

# 🔌 2. Минимальный набор lifecycle hooks (идеальный для Flight Recorder)

Даже если OpenCode даёт меньше — тебе важно стремиться к этой модели.

## 🟢 1. session.start

Вызывается при запуске OpenCode.

### Данные:

```ts
{
  cwd: string
  git?: {
    root: string
    branch: string
    commit: string
  }
  environment?: {
    os: string
    shell: string
    hostname: string
  }
}
```

### Твоя задача:

* создать `sessionId`
* открыть файловый writer (JSONL)
* записать `session.json`

---

## 🟡 2. request.beforeSend

Вызывается ПЕРЕД отправкой запроса в LLM.

### Данные:

```ts
{
  requestId: string

  provider: string
  model: string

  messages: Message[]

  systemPrompt?: string

  tools?: ToolSpec[]

  parameters?: {
    temperature?: number
    maxTokens?: number
    topP?: number
  }
}
```

### Что ты делаешь:

* фиксируешь **prompt snapshot**
* создаёшь `exchangeId`
* сохраняешь:

  * user intent (raw)
  * messages
  * model config

---

## 🔵 3. response.afterReceive

Самый важный hook.

Вызывается после ответа модели.

### Данные:

```ts
{
  requestId: string

  response: {
    text: string
    toolCalls?: ToolCall[]
    finishReason: string
  }

  usage?: {
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
  }

  latencyMs?: number
}
```

### Ты делаешь:

* дополняешь exchange
* нормализуешь usage
* считаешь cost
* сохраняешь response

---

## 🟣 4. tool.beforeExecute

Если OpenCode позволяет перехват инструментов.

### Данные:

```ts
{
  toolCallId: string
  name: string
  arguments: any
}
```

### Ты делаешь:

* логируешь tool usage
* связываешь с exchangeId

---

## 🟣 5. tool.afterExecute

```ts
{
  toolCallId: string
  result: any
  durationMs: number
}
```

---

## ⚫ 6. session.end

```ts
{
  sessionId: string
  durationMs: number
}
```

### Ты делаешь:

* закрываешь файлы
* пишешь summary.json
* финализируешь индекс

---

# 📊 3. Ключевая сущность: Exchange Lifecycle

Твоя система должна собирать exchange постепенно:

```text
1. beforeSend
   → создаём skeleton exchange

2. afterReceive
   → добавляем response + usage

3. tool hooks (optional)
   → дополняем execution graph

4. finalize
   → пишем в JSONL + SQLite
```

---

# 🧩 4. Внутренняя модель данных плагина

## Exchange (in-memory)

```ts
type Exchange = {
  id: string
  sessionId: string

  timestampStart: string
  timestampEnd?: string

  provider: string
  model: string

  request: {
    messages: any[]
    systemPrompt?: string
    parameters?: any
  }

  response?: {
    text: string
    toolCalls?: any[]
    finishReason?: string
  }

  usage?: {
    promptTokens: number
    completionTokens: number
    cachedTokens?: number
    costUsd?: number
  }

  latencyMs?: number

  tools?: ToolEvent[]

  metadata?: {
    cwd: string
    gitBranch?: string
    gitCommit?: string
  }
}
```

---

# 🧷 5. Критически важный момент архитектуры

## ⚠️ Plugin НЕ должен:

* анализировать смысл
* делать embedding
* делать summarization
* делать retrieval
* принимать решения

---

## ✔️ Plugin должен:

* слушать lifecycle
* собирать данные
* нормализовать формат
* писать JSONL / SQLite

---

# 🧭 6. Поток данных (реальный)

```text
OpenCode
   ↓
FlightRecorderPlugin
   ↓
ExchangeBuilder (memory)
   ↓
Normalizer (provider-agnostic)
   ↓
StorageAdapter
   ├── JSONL writer
   └── SQLite writer (later)
```

---

# 🧨 7. Самая важная инженерная деталь

## RequestId → ExchangeId mapping

Ты ОБЯЗАТЕЛЬНО должен:

```text
requestId (from OpenCode runtime)
        ↓
exchangeId (your system)
```

И хранить:

```ts
Map<requestId, exchangeId>
```

Иначе tool calls и response нельзя будет связать.

---

# 🧠 8. Что тебе нужно выяснить в OpenCode API (следующий шаг)

Чтобы перейти к коду, нужно проверить:

### 1. Есть ли реальные hooks?

* `onRequest`
* `onResponse`
* `onToolCall`
* `onSessionStart`

---

### 2. Или модель событий?

Например:

```ts
plugin.on("llm.request", ...)
plugin.on("llm.response", ...)
```

---

### 3. Или middleware chain?

```ts
export function middleware(next) {
  return async (ctx) => { ... }
}
```

---

### 4. Доступен ли raw provider request?

Это важно для:

* токенов
* cost
* system prompt

---

# 🧭 9. Итог выбора архитектуры плагина

Твой Flight Recorder должен быть:

## 🟢 Event-driven recorder

НЕ:

* agent
* skill
* intelligence layer

---

## 📦 Минимальная реализация plugin API:

```text
session.start
request.beforeSend
response.afterReceive
tool.beforeExecute
tool.afterExecute
session.end
```

