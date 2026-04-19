# FishBoss Backend Overview

## Runtime

- TypeScript
- Fastify
- Local-first file storage
- Storage root: `~/.fishboss`

## Storage Layout

The backend writes only through server-side code.

```text
~/.fishboss/
├── auth/
├── config/
├── data/
├── frontend-config/
├── logs/
├── media/
├── mcp/
├── prompts/
├── providers/
├── skills/
└── workflows/
```

## Implemented API Surface

- `/api/system`
  - health
  - stats
  - storage overview
- `/api/auth`
  - handshake
  - verify
  - revoke
  - status
- `/api/logs`
  - list
  - levels
- `/api/conversations`
  - CRUD
  - message listing and append
  - SSE placeholder stream
  - background execution placeholder
- `/api/agents`
  - CRUD
  - test
  - test stream placeholder
  - tool permission view
- `/api/workflows`
  - CRUD
  - execute placeholder
  - execution status and stop
- `/api/providers`
  - CRUD
  - list models
  - add custom model
  - test model placeholder
- `/api/mcp`
  - server CRUD
  - install/start/stop/restart placeholders
  - tool/resource listing
- `/api/skills`
  - CRUD
  - import placeholder
  - command listing
  - execute placeholder
- Reserved:
  - `/api/platform`
  - `/api/group`
  - `/api/media`

## Security Model

- Default local storage root is hidden (`~/.fishboss`)
- Frontend handshake returns a short-lived token
- Fixed secret bearer mode is still accepted for local/dev compatibility
- Session files store token hashes, not raw tokens as filenames
- Provider API keys are stored as hashes only in the current implementation
- Logs redact likely secret-bearing context fields

## Important Current Limitations

These are intentionally left as safe placeholders for later work:

- No real LLM provider transport yet
- No real MCP process installation/execution yet
- Conversation streaming is contract-complete but model output is placeholder content
- Background conversation execution is in-process and placeholder-based
- Platform/group/media are reservation endpoints only
- Provider keys are hashed rather than encrypted; this prevents key leaks but also prevents real outbound provider calls until encrypted secret storage is added

## Recommended Next Steps

1. Replace provider hash-only storage with encrypted-at-rest credentials.
2. Add real provider adapter layer and streaming transports.
3. Add persistent workflow run history.
4. Add MCP process supervision and install adapters.
5. Expand tests to cover route-level CRUD for each domain.
