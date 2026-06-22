# 📌 Разбиение на задачи (roadmap)

## 0. Инициализация проекта

**Задачи:**

* [ ] Создать репозиторий `opencode-flight-recorder`
* [ ] Выбрать язык реализации (предположительно TypeScript / Go / Python)
* [ ] Определить модель плагина OpenCode (entrypoint, lifecycle hooks)
* [ ] Поднять минимальный skeleton плагина

**Результат:**

* Плагин загружается OpenCode
* Есть лог "plugin loaded"

---

## 1. Capture Layer (MVP ядро)

**Цель:** перехватывать каждый LLM exchange

**Задачи:**

* [ ] Hook на начало запроса (request start)
* [ ] Hook на завершение ответа (response end)
* [ ] Получение:

  * messages
  * provider
  * model
  * timestamp
* [ ] Генерация `exchangeId`
* [ ] Связывание request/response

**Результат:**

* Каждый запрос фиксируется как JSON объект

---

## 2. Usage & metadata capture

**Задачи:**

* [ ] Извлечение token usage (provider-agnostic mapper)
* [ ] Нормализация:

  * promptTokens
  * completionTokens
  * cachedTokens
  * totalTokens
* [ ] Latency measurement
* [ ] Cost estimation (если доступно)

**Результат:**

* Полная телеметрия каждого запроса

---

## 3. Session management

**Задачи:**

* [ ] Создание session при старте opencode
* [ ] Определение sessionId
* [ ] Сбор:

  * cwd
  * git branch
  * git commit
  * hostname
* [ ] Закрытие session при exit

**Результат:**

* Все exchanges привязаны к session

---

## 4. Storage layer (JSONL MVP)

**Задачи:**

* [ ] Создание структуры директорий:

  * `~/.opencode-flight-recorder/sessions/...`
* [ ] Реализация JsonlWriter
* [ ] Append-only запись exchanges
* [ ] Запись session.json

**Результат:**

* Полная история сохраняется на диск

---

## 5. Tool call capture

**Задачи:**

* [ ] Перехват tool calls (bash, fs, http, etc.)
* [ ] Сохранение:

  * tool name
  * arguments
  * result (optional)
* [ ] Связка tool call → exchangeId

**Результат:**

* Можно восстановить "что реально делала модель"

---

## 6. Prompt lineage tracking

**Задачи:**

* [ ] Генерация parentId/rootId
* [ ] Связка последовательных запросов пользователя
* [ ] Хранение conversation graph

**Результат:**

* Можно строить дерево диалога

---

## 7. Semantic enrichment (v1 простая)

**Задачи:**

* [ ] Regex-based tag extractor
* [ ] Keyword extraction
* [ ] Simple topic detection
* [ ] Summary placeholder (без LLM пока)

**Результат:**

* Каждый exchange имеет tags + keywords

---

## 8. SQLite index (v1 аналитика)

**Задачи:**

* [ ] Добавить SQLite DB
* [ ] Таблица exchanges
* [ ] Индексация по:

  * tags
  * provider
  * model
  * timestamp
* [ ] Full-text search (FTS5)

**Результат:**

* Быстрый поиск по истории

---

## 9. CLI tool (flight command)

**Задачи:**

* [ ] `flight search`
* [ ] `flight stats`
* [ ] `flight cost`
* [ ] `flight export`
* [ ] `flight replay` (опционально)

**Результат:**

* Можно работать с историей вне OpenCode

---

## 10. History Agent (v2)

**Задачи:**

* [ ] Agent `@history`
* [ ] semantic search
* [ ] similar exchanges
* [ ] recall context injection
* [ ] summary of sessions

**Результат:**

* История становится частью workflow LLM

---

## 11. Export for training (advanced)

**Задачи:**

* [ ] Export dataset in SFT format
* [ ] Export filtered by:

  * tag
  * model
  * success rate
* [ ] conversation reconstruction

