# Swarm Scaling — Complexity Tiers

The foreman should match crew size to task complexity. Spinning up 5 agents to build a tic-tac-toe app is waste. Sending one builder to scaffold a SaaS platform is failure.

---

## Tier 0 — Micro (1 agent, 1 track)

**What:** Single-file edits, bug fixes, small utilities, scripts.  
**Examples:** Fix a type error, add a helper function, write a README, rename a variable across a codebase.  
**Signals:** < 5 files touched, no new dependencies, single concern.

| Role | Status |
|------|--------|
| Architect | Skipped — Foreman plans directly |
| Builder | 1 track |
| Inspector | Lint only, no test run |
| Security | Skipped |
| DevOps | Commit + PR |

**Estimated cost:** $0.10–$0.40  
**Estimated time:** 1–3 min

---

## Tier 1 — Simple (Architect + 1 Builder)

**What:** Self-contained apps, prototypes, standalone tools.  
**Examples:** Tic-tac-toe, todo app, CLI tool, landing page, single-endpoint API.  
**Signals:** < 20 files, one language/framework, no auth, no DB schema migrations.

| Role | Status |
|------|--------|
| Architect | 1 pass, forced single track |
| Builder | 1 track |
| Inspector | Tests + lint |
| Security | Secrets scan only |
| DevOps | Branch + PR |

**Estimated cost:** $0.50–$1.50  
**Estimated time:** 3–8 min

---

## Tier 2 — Standard (Architect + 2–3 Builders)

**What:** Feature-complete apps with multiple concerns.  
**Examples:** CRUD app with auth, REST API + frontend, microservice with tests and CI.  
**Signals:** 20–80 files, 2+ languages or layers (frontend/backend/db), requires migrations or config.

| Role | Status |
|------|--------|
| Architect | Full repo map, 2–3 parallel tracks |
| Builders | 2–3 parallel (e.g. backend + frontend + tests) |
| Inspector | Full test suite + type check + lint, heal loop |
| Security | Secrets + dep audit + SAST |
| DevOps | Branch + commit + PR with description |

**Estimated cost:** $2–$6  
**Estimated time:** 8–20 min

---

## Tier 3 — Complex (Full crew, 4 Builders)

**What:** Production-ready systems. Multiple services, significant business logic.  
**Examples:** SaaS MVP, monorepo with packages, auth + payments + billing + admin, multi-service API gateway.  
**Signals:** 80–300 files, multiple services or packages, external integrations, environment-specific config.

| Role | Status |
|------|--------|
| Architect | Deep repo map, reads existing code, 3–4 parallel tracks |
| Builders | 4 parallel (max) — each owns a service or domain |
| Inspector | Multi-pass heal loop (up to 3 cycles) |
| Security | Full scan — secrets, CVEs, SAST, OWASP checks |
| DevOps | Branch strategy, staged commits, PR with full changelog |

**Estimated cost:** $8–$20  
**Estimated time:** 20–45 min

---

## Tier 4 — Enterprise (Multi-swarm, sequential sessions)

**What:** Large-scale systems that exceed a single swarm's context. Built across multiple follow-up sessions using the persistent foreman + episodic memory.  
**Examples:** Full platform with user management, billing, analytics, infra-as-code, multi-region deployment, internal tooling suite.  
**Signals:** 300+ files, multiple repos or workspaces, long-running migrations, compliance requirements.

| Role | Status |
|------|--------|
| Foreman | Persistent across sessions, reads episodic memory |
| Architect | Reads prior session history, plans incrementally |
| Builders | Up to 4 per session, scoped to the current phase |
| Inspector | Regression-aware — checks existing tests still pass |
| Security | Full audit each session, tracks findings over time |
| DevOps | Per-phase PRs, links to prior PRs in description |

**Estimated cost:** $20–$80+ (across sessions)  
**Estimated time:** Multiple sessions over hours or days

---

## Complexity Detection (not yet built)

The Architect currently always plans for max parallelism regardless of task size. The goal is to auto-classify before planning:

```python
def estimate_tier(goal: str, repo_file_count: int) -> int:
    # keyword signals
    keywords_t3 = ["saas", "platform", "multi-service", "payments", "billing", "auth + "]
    keywords_t2 = ["api", "frontend", "auth", "database", "crud", "rest", "graphql"]
    keywords_t0 = ["fix", "rename", "update", "add comment", "typo", "bump version"]

    if any(k in goal.lower() for k in keywords_t0) and repo_file_count < 5:
        return 0
    if any(k in goal.lower() for k in keywords_t3) or repo_file_count > 80:
        return 3
    if any(k in goal.lower() for k in keywords_t2) or repo_file_count > 20:
        return 2
    return 1
```

Tier maps to:
- Max parallel builder tracks
- Whether Inspector runs tests or just lint
- Whether Security does a full scan or secrets-only
- Whether Architect gets the full repo map or just the root

---

## Implementation Priority

- [x] Tier 2 — current default behavior
- [ ] Tier 0/1 — single-track fast path, skip Security, lightweight Inspector
- [ ] Complexity classifier in Architect prompt preamble
- [ ] Tier 3 — add explicit 4-track cap enforcement
- [ ] Tier 4 — episodic memory + multi-session foreman persistence
