# Gantry

**Submit a task. Walk away. Come back to a pull request.**

Gantry is a software engineering factory. You describe what needs to be built. A crew of specialised agents plans it, writes it in parallel across independent tracks, tests it, heals failures automatically, and opens a PR on your GitHub repo — while you do something else.

Submit 1 task or 1000. Each is an independent pipeline. An engineering team can put an entire sprint's backlog in on Monday morning and spend the week reviewing PRs instead of writing boilerplate.

---

## What this is not

**Not a pair programmer.** Gantry is not Cursor, GitHub Copilot, or Claude Code. Those tools are synchronous — they require an engineer present, guiding, correcting, prompting the next step. The bottleneck is human attention. Gantry is asynchronous. The pipeline runs without you. You write the goal. You review the PR. Everything in between is the factory's problem.

Claude Code is for an engineer who wants to move faster right now, in the flow of their current work. Gantry is for a tech lead who has 20 tickets in the backlog and wants 15 of them drafted by tomorrow without assigning them to anyone. One is a power tool. The other is a factory floor. Nobody says a factory is a slower version of a craftsman's workshop. They are not competing. One makes one chair at a time, beautifully, with full attention. The other makes a thousand chairs while the craftsman sleeps.

**Not a chat interface.** There is no conversation. You give Gantry a goal, it runs a full engineering pipeline, and it delivers a branch with a pull request. The only time it stops and waits for you is at explicit approval checkpoints on complex tasks — reviewing the build plan before builders launch, or confirming a deployment. Otherwise it runs to completion without you.

**Not a wrapper around an LLM.** A single LLM call does not build software. What does is the orchestration — parallel execution across independent tracks, structured handoffs between specialised roles, a self-healing loop that retries failures with concrete fix instructions, and durable state that survives crashes and restarts. The LLM is a component. The factory is the product.

---

## The construction crew

Think of Gantry as a silicon construction crew — a non-contested engineering team that works in parallel, never argues about scope, and hands you a PR when the job is done.

Each role in the pipeline is a specialised agent with its own toolset, context window, and model. They do not share memory mid-build — they hand off structured artifacts. The Architect produces a plan. The Builders execute tracks from that plan simultaneously. The Inspector verifies and generates precise fix instructions. The crew does not need to be managed. It needs to be assigned.

A construction project does not have one worker who designs the building, pours concrete, frames walls, runs electrical, and inspects the work. It has a crew with defined roles running in parallel, coordinated by a foreman. That is the model.

**At scale:** each task is an independent Temporal workflow with no shared state between runs. The only limits are worker capacity, LLM rate limits, and GitHub API throughput — all horizontally scalable. 1000 tasks in, 1000 PRs out.

---

## Who it is for

Engineering teams with a backlog of well-scoped tasks that keep getting deprioritised. Features that are clear enough to implement but take 4–8 hours of mechanical execution. The kind of work your team knows exactly how to do but hasn't had time to start.

**Gantry handles well:**
- Features that touch multiple files across the stack (API + UI + tests + config)
- Scaffolding a new service, module, or integration from a spec
- Applying a consistent change across many files — logging, tracing, auth guards, error handling
- Greenfield projects where the architecture is clear and execution is the bottleneck

**Gantry does not handle well:**
- Exploratory debugging ("why is this flaky test failing in CI?")
- Architecture decisions that require human judgment mid-task
- Tasks with ambiguous requirements that need iteration to discover
- Anything that requires a conversation to define

---

## What it does

Gantry takes a natural language goal and runs it through a structured pipeline:

```
PM → Architect → Builders (parallel) → Inspector → Security → DevOps
```

Each stage is a separate agent with a focused toolset. The Architect decomposes the goal into independent tracks. Multiple Builder agents write code simultaneously. The Inspector runs tests and lint, triggering self-healing cycles if anything fails. Security scans for secrets and CVEs. DevOps branches, commits, pushes, and opens a PR.

On Standard and Full Crew tiers, the pipeline pauses at key decisions — build plan review before builders launch, deployment approval before the PR is opened — and waits for your explicit sign-off via an inline approval card in the UI. Approve, reject, or enable auto-approve to let it run unattended.

If you point Gantry at a local directory that has no GitHub remote, it creates the GitHub repo automatically before the first push.

The whole pipeline is a [Temporal](https://temporal.io) workflow. Close your laptop mid-build — it continues when the worker comes back.

---

## What makes it different

**Parallel by design.** The Architect splits work into independent tracks (frontend, backend, tests, infra). Builders run simultaneously. A full-stack feature that would take one agent 45 minutes sequentially takes 15 in parallel.

**Self-correcting.** When the Inspector finds failures, it generates concrete fix instructions and re-invokes the Builder. If the original plan was structurally wrong, the Architect re-decomposes before burning heal cycles. The swarm escalates to you only after exhausting every automated recovery path.

**Code-aware.** After each build, a symbol index maps every function, class, and type to its file and line number. Agents query the index instead of reading files blind. Builders use it to locate definitions before editing. The Architect uses it to plan on re-runs.

**GitHub-native.** Connect a GitHub repo by URL, or point at a local directory and Gantry creates the remote repo for you. Builds on the repo and pushes a branch with a PR. Works with public and private repos via a Personal Access Token.

**Durable.** Every agent is a Temporal child workflow. Every file write, LLM call, and shell command is a retryable activity. Crashes replay from the last checkpoint. Nothing is lost.

---

## The crew

| Agent | Role | Model |
|---|---|---|
| **Foreman** | Orchestrates the pipeline, manages heal loops, HITL checkpoints | — |
| **PM** | Enriches the goal, asks clarifying questions (tier ≥ 1) | Sonnet / Haiku |
| **Architect** | Maps the repo, decomposes into parallel tracks with dependency ordering | Sonnet |
| **Builder** | Writes code, self-verifies with lint + type-check before finishing | Sonnet / Haiku |
| **Inspector** | Runs tests, lint, type-check, coverage; generates heal instructions | Sonnet / Haiku |
| **Security** | Scans for secrets, CVEs, insecure patterns; blocks PR on critical findings | Haiku |
| **DevOps** | Branches, commits, pushes, opens PR via `gh` CLI | Haiku |

Model routing is automatic: Haiku (`claude-haiku-4-5-20251001`) for Tier 0/1 tasks (micro fixes, simple scripts), Sonnet (`claude-sonnet-4-6`) for Tier 2/3 (features, full-stack builds). ~10x cost reduction on simple tasks.

---

## Complexity tiers

Gantry classifies every goal using a fast LLM call before dispatching agents:

| Tier | Label | Tracks | Heal cycles | Security | HITL |
|---|---|---|---|---|---|
| 0 | Micro | 1 | 0 | ✗ | ✗ |
| 1 | Lightweight | 1 | 1 | ✗ | ✗ |
| 2 | Standard | 2 | 2 | ✓ | Architect review |
| 3 | Full Crew | 4 | 2 | ✓ | Architect + DevOps |

Override with `tier=0–3` in the task params or via the Settings panel.

---

## Self-healing loop

```
Builder writes code
    ↓
verify_build (lint + types inline)
    ↓
Inspector runs full test suite
    ↓ fail
heal_instructions → Builder (up to max_heal_cycles)
    ↓ still failing
Architect re-decomposes with Inspector findings
    ↓ still failing
HITL checkpoint → user decides
```

Each heal cycle starts from a git snapshot taken before the cycle began. A bad heal can't corrupt a good previous state.

---

## Stack

**Backend**
- [Scale Agentex](https://github.com/scaleapi/scale-agentex) — agent hosting, ACP protocol, message streaming
- [Temporal](https://temporal.io) — durable workflow orchestration, activity retries, child workflows
- [Anthropic Claude](https://anthropic.com) (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) — all LLM reasoning
- Python 3.12 / [uv](https://github.com/astral-sh/uv)

**Frontend**
- [Next.js](https://nextjs.org) / React 19
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://zustand-demo.pmnd.rs)

---

## Project structure

```
Gantry/
├── activities/
│   ├── _shared.py                   # base types and shared helpers
│   ├── file_activities.py           # read, write, patch, delete, list
│   ├── shell_activities.py          # run_command, run_tests, lint, type-check, coverage
│   ├── git_activities.py            # git init, diff, commit, branch, push
│   ├── github_activities.py         # repo creation, PR open via gh CLI
│   ├── web_activities.py            # fetch_url, brave search
│   ├── security_activities.py       # secret scan, CVE lookup
│   ├── index_activities.py          # symbol index build + query
│   ├── manifest_activities.py       # Agentex manifest generation
│   ├── swarm_activities.py          # backward-compat re-export shim
│   ├── memory_activities.py         # facts store + episodic memory
│   ├── classify_tier_activity.py    # LLM-based complexity classification
│   ├── quality_score_activity.py    # LLM build quality scoring (0–10)
│   ├── trace_activity.py            # structured agent trace recording
│   ├── builder_planner_activity.py
│   ├── architect_planner_activity.py
│   ├── inspector_planner_activity.py
│   ├── security_planner_activity.py
│   ├── devops_planner_activity.py
│   └── pm_planner_activity.py
│
├── workflows/
│   ├── swarm_orchestrator.py        # Foreman — top-level pipeline, HITL checkpoints
│   ├── architect_agent.py           # pre-loads PM memory before planning
│   ├── builder_agent.py
│   ├── inspector_agent.py           # self-healing loop, dependency-skip logic
│   ├── security_agent.py
│   ├── devops_agent.py
│   └── pm_agent.py
│
├── project/
│   ├── config.py                    # env vars, model constants, GH_TOKEN
│   ├── child_workflow.py            # ApprovalWorkflow — durable HITL signal handler
│   ├── planner.py                   # Claude tool-use loop, context management
│   ├── complexity.py                # tier params + regex fallback
│   ├── architect_tools.py
│   ├── builder_tools.py             # verify_build, find_symbol, query_index
│   ├── inspector_tools.py           # run_coverage
│   ├── devops_tools.py
│   ├── security_tools.py
│   ├── pm_tools.py
│   ├── memory_tools.py
│   ├── run_worker.py                # Temporal worker entrypoint
│   └── acp.py                       # Agentex ACP server
│
├── ui/                              # Next.js frontend
│   ├── app/
│   │   ├── page.tsx                 # home / search
│   │   ├── task/[taskId]/           # live build view
│   │   ├── projects/                # project dashboard
│   │   ├── agents/                  # agent directory + live monitor + settings
│   │   ├── docs/                    # platform documentation
│   │   └── api/
│   │       ├── projects/            # project CRUD + registry
│   │       ├── tasks/[taskId]/
│   │       │   ├── signal/          # Temporal approval signal proxy
│   │       │   └── terminate/       # workflow cancellation
│   │       ├── traces/              # agent trace retrieval
│   │       ├── tree/                # repo file tree
│   │       └── github/repos/        # GitHub repo proxy (PAT-authenticated)
│   ├── components/
│   │   ├── swarm-view.tsx           # 70/30 split: file explorer + activity feed
│   │   ├── message-feed.tsx         # real-time agent message renderer
│   │   ├── search-home.tsx          # goal input + project selector
│   │   ├── sidebar.tsx
│   │   ├── feed/                    # message-feed domain modules
│   │   │   ├── agent-utils.ts       # parsers, regex constants, role colours
│   │   │   ├── agent-row.tsx        # per-message renderer
│   │   │   ├── plan-cards.tsx       # kickoff, plan-ready, launch, strategy cards
│   │   │   ├── builder-cards.tsx    # tool-use, track-breakdown, builder-steps cards
│   │   │   ├── hitl-cards.tsx       # approval + clarification interactive cards
│   │   │   ├── status-indicators.tsx# pulsing dot, thinking dots, terminal banner
│   │   │   ├── tool-icon.tsx        # tool → icon mapping
│   │   │   └── builder-progress.ts  # shared builder progress context
│   │   ├── swarm/                   # swarm-view domain modules
│   │   │   ├── utils.ts             # shared types, stage parsers, file helpers
│   │   │   ├── pipeline-tracker.tsx # animated stage pipeline with builder lanes
│   │   │   ├── traces-panel.tsx     # structured agent trace viewer
│   │   │   ├── context-usage.tsx    # token + cost estimation indicator
│   │   │   ├── preview-pane.tsx     # live iframe preview with address bar
│   │   │   └── report-card.tsx      # build report + status badge
│   │   └── agents/
│   │       ├── config-panel.tsx     # swarm settings + GitHub PAT
│   │       └── agent-directory.tsx
│   └── lib/
│       ├── agent-config-store.ts    # Zustand: swarm config + GitHub token
│       ├── project-repository.ts   # project + GitHub repo API client
│       └── use-projects.ts
│
├── tests/
│   ├── test_orchestrator_guards.py  # tier-gated HITL checkpoint unit tests
│   └── test_pipeline_integration.py # end-to-end pipeline stage transition tests
│
├── manifest.yaml                    # Agentex agent manifest
├── dev.sh                           # dev launcher
├── pyproject.toml
└── .env.example
```

---

## Getting started

### Prerequisites

- Python 3.12+ and [uv](https://github.com/astral-sh/uv)
- Node.js 20+
- [Temporal CLI](https://docs.temporal.io/cli) — `brew install temporal`
- Scale Agentex platform — `cd scale-agentex/agentex && docker compose up -d`

### Setup

```bash
cp .env.example .env
# Required: ANTHROPIC_API_KEY
# Optional: GH_TOKEN (for GitHub clone + push), BRAVE_SEARCH_API_KEY (for web search in builders)
```

```bash
# Install Python deps
uv sync

# Install UI deps
cd ui && npm install
```

### Run

```bash
./dev.sh
```

Starts:
1. Temporal dev server (`:7233`)
2. Agentex platform (`:5003`)
3. Gantry worker — ACP server (`:8000`) + Temporal worker
4. Next.js UI (`:3000`)

Open [http://localhost:3000](http://localhost:3000).

---

## GitHub integration

To build on an existing GitHub repo:

1. Go to **Agents → Settings → GitHub** and paste a Personal Access Token
   - Classic PAT: needs `repo` scope
   - Fine-grained: needs `contents: write` + `pull_requests: write`
2. Create a project and paste the GitHub HTTPS URL (e.g. `https://github.com/owner/repo`)
3. Submit a goal — Gantry clones the repo, builds, and opens a PR

The token is stored in your browser only. It's passed to the worker as a task param and used only for clone and push operations.

---

## Memory

Gantry maintains persistent memory across builds so the system gets smarter over time.

**Facts store** (`.gantry/memory/facts.json`) — key/value facts written by any agent during a build. Architects store tech stack decisions. Builders store known failure patterns. Facts with `arch.` or `pm.` prefixes expire after 90 days.

**Episodic memory** — one record per completed build, written at two levels:

- **Per-repo** (`.gantry/memory/episodes.jsonl`) — history for this specific repository
- **Platform-wide** (`~/.gantry/episodes.jsonl`) — history across every repo ever built on this machine

Before planning, the Architect searches the platform-wide store. A new React project gets the learning from every prior React build you've run — what track decompositions worked, what failed, what quality scores were achieved. Same-repo episodes are boosted in ranking so local context still wins ties. The more tasks run, the better every future Architect gets.

---

## Configuration

All swarm parameters are configurable from **Agents → Settings**:

| Setting | Default | Description |
|---|---|---|
| Branch prefix | `swarm` | Git branches named `prefix/task-id` |
| Max parallel tracks | 4 | Concurrent Builder agents |
| Max heal cycles | 3 | Inspector → Builder retry limit |
| Tier override | Auto | Force a specific complexity tier |
| GitHub PAT | — | Token for clone + push |

---

## Roadmap

- **Next**: Multi-repo support (one task touching multiple repos), pre-flight track conflict validation to detect dependency clashes before builders launch
- **Later**: Cost budgets + pre-task estimation, agent specialisation profiles (database builder, React builder, API builder), branch-level CI integration (wait for CI green before opening PR)
- **Production**: Supabase Postgres for project registry, persistent volume for repo files, Vercel for UI, Fly.io for worker
