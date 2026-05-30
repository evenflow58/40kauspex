# 40K Auspex — Project Guide

Full-stack SaaS web app. React MFE frontend + Node.js AWS microservices backend.

## Mono-repo structure

```
apps/
  shell/          # Host MFE container — port 3000
  mfe-home/       # Home micro-frontend — port 3001
  mfe-companion/  # Companion micro-frontend — port 3002
packages/
  ui/             # Shared React component library
services/         # Node.js Lambda functions (one folder per service)
infrastructure/   # AWS CDK (TypeScript)
docs/
  architecture/   # Architecture decision records from the architect agent
  design/         # UI/UX specs from the designer agent
```

## Tech stack

- **Package manager**: pnpm workspaces
- **Build orchestration**: Turborepo
- **Frontend**: React 18, TypeScript, Vite
- **MFE**: Module Federation via `@originjs/vite-plugin-federation`
- **Backend**: Node.js 20, AWS Lambda, API Gateway
- **Infra**: AWS CDK (TypeScript)

## Routing model

The shell owns the single `<BrowserRouter>`. Each remote consumes
`react-router-dom` as a shared singleton (configured in every app's
`vite.config.ts`) and mounts its `<Routes>` under the path the shell assigns:

| Path           | Owner                                    |
| -------------- | ---------------------------------------- |
| `/`            | `mfe-home` (federated as `mfe_home`)     |
| `/companion/*` | `mfe-companion` (federated as `mfe_companion`) |
| `/login`       | shell                                    |
| `/auth/callback` | shell                                  |

Routes inside a remote are declared **relative to its mount point**, so
`mfe-companion`'s game-selection page is `<Route index />` not
`<Route path="/companion" />`. User-facing URLs (e.g. `/companion/games/...`)
remain absolute; only the route definitions inside the remote are relative.

## Running locally

**First time / after dependency changes:**
```bash
pnpm install
```

**Development (preview mode — MFE federation works):**
```bash
# Terminal 1 — build and serve the home remote
pnpm --filter @40kauspex/mfe-home build
pnpm --filter @40kauspex/mfe-home preview   # serves on :3001

# Terminal 2 — build and serve the companion remote
pnpm --filter @40kauspex/mfe-companion build
pnpm --filter @40kauspex/mfe-companion preview   # serves on :3002

# Terminal 3 — run shell dev server
pnpm --filter @40kauspex/shell dev           # serves on :3000
```

Open http://localhost:3000

**Build all:**
```bash
pnpm build
```

## MFE dev mode note

`@originjs/vite-plugin-federation` does not support hot-reload in Vite dev mode for remotes.
Each remote (`mfe-home`, `mfe-companion`) must be built and served via `vite preview` for
federation to work. For active development on a remote: run
`pnpm --filter @40kauspex/mfe-<name> build --watch` in another terminal so changes rebuild
automatically.

## Agents

Six specialist agents live in `.claude/agents/`. Always start with the **orchestrator**
for new features — it sequences architect → designer → developer → code-reviewer → tester.
