# OpenCode Flight Recorder

## Overview

OpenCode Flight Recorder is a plugin for OpenCode that captures, structures, and stores all interactions with LLMs in a reproducible and analyzable format.

It acts as a "black box recorder" for LLM usage, enabling:

- full prompt/response history tracking
- token and cost analytics
- model/provider comparison
- session reconstruction
- dataset generation for fine-tuning
- semantic search over past interactions

---

## Core Principles

### 1. Capture everything, modify nothing
The plugin does not alter prompts or responses. It only observes and records.

### 2. Provider-agnostic normalization
All LLM providers are normalized into a unified schema.

### 3. Append-only storage
All data is immutable. No overwrites.

### 4. Separation of concerns
- Plugin = capture + storage
- Agent = analysis + retrieval
- CLI = interaction layer

---

## Data Model

### Session

A session represents a single OpenCode runtime lifecycle.

Includes:
- sessionId
- cwd
- git branch/commit
- environment metadata
- timestamps

---

### Exchange

A single LLM interaction (request → response).

Includes:
- messages
- provider
- model
- usage (tokens, cost, latency)
- tool calls
- timestamps
- lineage (parent/root links)

---

### Semantic Metadata

Derived metadata (optional phase 2):

- tags
- keywords
- summary
- intent
- topic classification

---

## Storage Layout

```

~/.opencode-flight-recorder/
sessions/
YYYY/
MM/
DD/ <session-id>/
session.json
exchanges.jsonl
semantic.jsonl

```

---

## Key Features

### 1. Full LLM telemetry capture
- provider
- model
- tokens
- cost
- latency

### 2. Tool call tracing
- bash
- filesystem
- external APIs

### 3. Prompt lineage tracking
- conversation graph
- root cause reconstruction

### 4. Session-based organization
- grouped by working context
- git-aware

### 5. Future: semantic memory layer
- tagging
- summarization
- similarity search

---

## Non-Goals

- modifying model behavior
- intercepting or rewriting prompts
- acting as an LLM proxy (unless explicitly extended later)
- enforcing policies or guardrails

---

## Architecture

Plugin:
- captures runtime events
- writes JSONL logs

CLI:
- reads logs
- provides search & stats

Agent (future):
- semantic search
- recall
- summarization

Storage:
- filesystem (MVP)
- SQLite (phase 2)
- vector DB (phase 3)

---

## MVP Scope

The first version must implement:

- session creation
- exchange capture
- usage normalization
- JSONL storage
- basic CLI viewer

Everything else is incremental.

---

## Long-term Vision

This project is not just logging.

It is a **Flight Recorder for LLM cognition**, enabling:

- reproducibility of AI workflows
- analysis of model behavior over time
- dataset generation from real usage
- personal AI memory system

