'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ── Doc tree ──────────────────────────────────────────────────────────────────

type DocSection = {
  title: string;
  slug: string;
  children?: { title: string; slug: string }[];
};

const DOC_TREE: DocSection[] = [
  {
    title: 'Introduction',
    slug: 'introduction',
  },
  {
    title: 'Architecture',
    slug: 'architecture',
    children: [
      { title: 'Overview', slug: 'architecture-overview' },
      { title: 'Temporal & Durability', slug: 'architecture-temporal' },
      { title: 'Swarm Pipeline', slug: 'architecture-pipeline' },
      { title: 'Manifest & State', slug: 'architecture-manifest' },
    ],
  },
  {
    title: 'Agents',
    slug: 'agents',
    children: [
      { title: 'Foreman', slug: 'agents-foreman' },
      { title: 'PM', slug: 'agents-pm' },
      { title: 'Architect', slug: 'agents-architect' },
      { title: 'Builder', slug: 'agents-builder' },
      { title: 'Inspector', slug: 'agents-inspector' },
      { title: 'Security', slug: 'agents-security' },
      { title: 'DevOps', slug: 'agents-devops' },
    ],
  },
  {
    title: 'Complexity Tiers',
    slug: 'tiers',
  },
  {
    title: 'Self-Healing',
    slug: 'healing',
    children: [
      { title: 'Heal Loop', slug: 'healing-loop' },
      { title: 'Architect Re-planning', slug: 'healing-replan' },
      { title: 'Git Snapshots', slug: 'healing-snapshots' },
    ],
  },
  {
    title: 'Code Intelligence',
    slug: 'intelligence',
    children: [
      { title: 'Repo Index', slug: 'intelligence-index' },
      { title: 'Symbol Search', slug: 'intelligence-symbols' },
      { title: 'Track Dependencies', slug: 'intelligence-deps' },
    ],
  },
  {
    title: 'Test-Driven Building',
    slug: 'tdd',
  },
  {
    title: 'Memory',
    slug: 'memory',
    children: [
      { title: 'Facts Store', slug: 'memory-facts' },
      { title: 'Episodic Memory', slug: 'memory-episodes' },
    ],
  },
  {
    title: 'Configuration',
    slug: 'configuration',
  },
  {
    title: 'Running Locally',
    slug: 'local',
  },
];

// ── Doc content ───────────────────────────────────────────────────────────────

const DOCS: Record<string, { title: string; body: string }> = {
  introduction: {
    title: 'Introduction',
    body: `# Gantry

Gantry is a durable, multi-agent software engineering factory. You describe what to build — a feature, a fix, a full-stack app — and a coordinated crew of specialised agents plans, writes, tests, secures, and ships the code.

## What makes it different

**Durable by default.** Every build runs inside a Temporal workflow. If your laptop closes, the worker crashes, or the network drops, the swarm picks up exactly where it left off. No lost work, no restarts.

**Parallel execution.** The Architect decomposes your goal into independent tracks. Multiple Builder agents write code simultaneously — frontend, backend, tests, and infra in parallel — then the Inspector validates the merged result.

**Self-correcting.** When the Inspector finds failures, it generates concrete fix instructions and re-invokes the Builder. If the original plan was structurally wrong, the Architect re-decomposes before burning heal cycles. The swarm escalates to you only after exhausting every automated recovery path.

**Code-aware.** After each build, a symbol index maps every function, class, and type to its file and line number. Agents query the index instead of reading files blind. The Architect uses it to plan. Builders use it to locate definitions before editing.

## When to use it

- Building a new feature across multiple files or services
- Scaffolding a full-stack application from a description
- Fixing a bug that requires understanding a large codebase
- Running a security audit and auto-patching findings
- Any task where you want durable, auditable, parallel code generation
`,
  },

  'architecture-overview': {
    title: 'Architecture Overview',
    body: `# Architecture Overview

Gantry is built on three layers:

## 1. Agentex (hosting + protocol)

Agentex provides the agent hosting infrastructure. It handles containerisation, secrets injection, message streaming, and the Agent-to-Client Protocol (ACP) that lets any client talk to any agent with a unified interface.

## 2. Temporal (durability + orchestration)

Every swarm run is a Temporal workflow. Temporal provides:

- **Durable execution** — workflow state survives crashes and restarts
- **Activity retries** — failed LLM calls or file operations retry automatically
- **Child workflows** — each agent (Architect, Builder, Inspector) runs as an isolated child workflow
- **Signals** — follow-up prompts from the user are delivered as Temporal signals

## 3. The Swarm (agents + tools)

The swarm is a pipeline of specialised agents, each with a focused toolset:

\`\`\`
PM → Architect → Builders (parallel) → Inspector (heal loop) → Security → DevOps
\`\`\`

Each agent is a Temporal child workflow that calls an LLM in a tool-use loop, executes activities (file I/O, shell commands, git operations), and returns a structured result to the Foreman.

## Data flow

1. User submits a goal via the UI
2. Agentex creates a task and routes it to the SwarmOrchestrator workflow
3. The Foreman classifies complexity, dispatches agents in sequence, and manages the heal loop
4. Agents emit \`[Role] message\` tagged messages that the UI parses in real time
5. The final report is emitted as a structured message; the UI renders it in the Crew tab
`,
  },

  'architecture-temporal': {
    title: 'Temporal & Durability',
    body: `# Temporal & Durability

## Why Temporal

Software engineering tasks are long-running. A full-stack build can take 20–45 minutes. Without durability, any interruption — network blip, worker restart, laptop close — loses all progress.

Temporal solves this with **event sourcing**: every workflow step is recorded in an append-only event history. If a worker dies, a new worker replays the history and resumes from the last checkpoint. The workflow code never knows the difference.

## Workflow hierarchy

\`\`\`
SwarmOrchestrator (parent)
├── PMAgent
├── ArchitectAgent
├── BuilderAgent (×N, parallel)
│   └── plan_builder_step (activity, repeated per turn)
├── InspectorAgent
├── SecurityAgent
└── DevOpsAgent
\`\`\`

Each agent is a \`@workflow.defn\` class. The Foreman launches them as child workflows with \`workflow.execute_child_workflow()\`.

## Activities vs workflows

- **Activities** are single, retryable operations: read a file, call the LLM, run a shell command. They have timeouts and retry policies.
- **Workflows** are durable orchestrators. They call activities and child workflows but never do I/O directly.

This separation means an LLM call that times out retries automatically. A file write that fails retries up to 3 times. The workflow itself never fails due to transient errors.

## State persistence

Workflow instance variables (e.g. \`self._manifest\`, \`self._conversation_history\`) are serialised into Temporal's event history on every state change. This means:

- The manifest is durable — no filesystem dependency
- Conversation history survives worker restarts
- Follow-up prompts delivered via signals are never lost

## Follow-up loop

After each build, the Foreman waits up to 24 hours for a follow-up signal:

\`\`\`python
await workflow.wait_condition(
    lambda: self._pending_followup is not None,
    timeout=timedelta(hours=24),
)
\`\`\`

The user can send a follow-up from the UI at any time. The Foreman re-runs the full pipeline with the new goal on the same repo.
`,
  },

  'architecture-pipeline': {
    title: 'Swarm Pipeline',
    body: `# Swarm Pipeline

The pipeline runs in sequence. Each stage is a child workflow that returns a structured JSON result to the Foreman.

## Stage 0: PM (tier ≥ 1)

The Project Manager scans the repo for context (README, package.json, pyproject.toml), searches past build episodes for similar work, and optionally asks the user clarifying questions via a HITL checkpoint. Returns an \`enriched_goal\` that the Architect uses.

Skipped on Tier 0 (micro tasks).

## Stage 1: Architect

Reads the repo, maps the tech stack, and decomposes the goal into parallel tracks. Each track has:

- \`label\` — short name (e.g. "backend", "frontend", "tests")
- \`implementation_steps\` — ordered list of actions for the Builder
- \`key_files\` — files this track owns (prevents conflicts)
- \`exports\` — symbols this track will export for sibling tracks
- \`depends_on\` — tracks that must complete before this one starts
- \`test_spec\` — test cases the Builder should write first (TDD)

## Stage 2: Builders (parallel, wave-ordered)

Tracks are sorted into waves by their \`depends_on\` graph. Each wave runs in parallel; waves execute sequentially. This means:

- Independent tracks (frontend + backend) run simultaneously
- Dependent tracks (tests that import from backend) wait for their dependencies

Each Builder runs a tool-use loop: read files, write code, verify build, finish.

## Stage 3: Inspector (heal loop)

Runs tests, lint, and type checks. If checks fail, produces \`heal_instructions\` and re-invokes the Builder. Up to \`max_heal_cycles\` attempts before escalating.

If heal cycles are exhausted, the Architect is re-invoked with the Inspector's findings to produce a structurally different plan.

## Stage 4: Security

Scans for committed secrets, vulnerable dependencies, and insecure patterns. Blocks the PR if critical or high findings exist.

Skipped in lightweight mode (tier 0/1).

## Stage 5: DevOps

Creates the branch, stages all changes, commits with a conventional message, pushes, and opens a pull request via the GitHub CLI.

## HITL checkpoints

- **Tier 2+**: User approves the Architect's plan before builders launch
- **Tier 3+**: User approves the PR before DevOps runs
- **Heal exhaustion**: User decides whether to proceed with broken code
`,
  },

  'architecture-manifest': {
    title: 'Manifest & State',
    body: `# Manifest & State

## The shared manifest

When multiple Builder agents run in parallel, they need to know what each other owns. Without coordination, two builders might write to the same file, or a frontend builder might import a path the backend builder hasn't created yet.

The manifest solves this. After the Architect finishes, the Foreman builds a manifest dict:

\`\`\`python
self._manifest = {
    "version": 1,
    "tracks": [
        {
            "label": "backend",
            "key_files": ["src/api/users.py", "src/models/user.py"],
            "exports": ["UserService", "AuthMiddleware"],
            "goal_summary": "Build REST API for user management",
        },
        ...
    ],
    "completed_edits": [],
}
\`\`\`

Before each wave launches, the manifest is serialised and passed to every Builder as \`manifest_snapshot\`. Each Builder sees:

- Which files it owns (write freely)
- Which files siblings own (do not touch)
- What symbols siblings export (import correctly)
- Which files have already been written (patch, don't overwrite)

## Why workflow state, not filesystem

The manifest lives on \`self._manifest\` — a workflow instance variable serialised by Temporal. This means:

- It works correctly on distributed workers (no shared filesystem needed)
- It survives worker restarts
- It's updated after each wave, so later waves see earlier waves' completed edits

## Completed edits tracking

After each wave, the Foreman appends every file edit to \`manifest["completed_edits"]\`. Subsequent builders see this list and know to use \`patch_file\` instead of \`write_file\` on already-written paths.
`,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DocsPage() {
  const [activeSlug, setActiveSlug] = useState('introduction');
  const doc = DOCS[activeSlug] ?? DOCS['introduction'];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left nav */}
      <nav style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        overflowY: 'auto', padding: '1.5rem 0.75rem',
        background: 'var(--surface)',
      }}>
        <p style={{
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-secondary)',
          padding: '0 0.5rem', marginBottom: '0.75rem',
        }}>
          Documentation
        </p>
        {DOC_TREE.map(section => (
          <div key={section.slug} style={{ marginBottom: '0.25rem' }}>
            <button
              onClick={() => { if (!section.children) setActiveSlug(section.slug); }}
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                padding: '0.35rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
                fontSize: '0.8375rem', fontWeight: section.children ? 600 : 400,
                color: activeSlug === section.slug ? 'var(--accent)' : 'var(--text-primary)',
                fontFamily: 'inherit',
                background: activeSlug === section.slug ? 'var(--surface-raised)' : 'transparent',
              } as React.CSSProperties}
            >
              {section.title}
            </button>
            {section.children && (
              <div style={{ paddingLeft: '0.75rem', marginTop: '0.125rem' }}>
                {section.children.map(child => (
                  <button
                    key={child.slug}
                    onClick={() => setActiveSlug(child.slug)}
                    style={{
                      width: '100%', textAlign: 'left', border: 'none',
                      padding: '0.3rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.8125rem', fontFamily: 'inherit',
                      color: activeSlug === child.slug ? 'var(--accent)' : 'var(--text-secondary)',
                      background: activeSlug === child.slug ? 'var(--surface-raised)' : 'transparent',
                      fontWeight: activeSlug === child.slug ? 500 : 400,
                    } as React.CSSProperties}
                  >
                    {child.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '2.5rem 3rem', maxWidth: 760 }}>
        <article style={{
          fontSize: '0.9rem', lineHeight: 1.75, color: 'var(--text-primary)',
        }}>
          <DocBody body={doc.body} />
        </article>
      </main>
    </div>
  );
}

function DocBody({ body }: { body: string }) {
  const lines = body.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.5rem', marginTop: 0 }}>
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} style={{ fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.01em', marginTop: '2rem', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)' }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} style={{ fontSize: '1rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.375rem' }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} style={{
          background: 'var(--surface-raised)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '1rem 1.25rem', overflowX: 'auto',
          fontSize: '0.8125rem', lineHeight: 1.6, margin: '1rem 0',
          fontFamily: 'monospace',
        }}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: '0.25rem' }}>{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '0.5rem' }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: '0.5rem 0' }}>{inlineFormat(line)}</p>
      );
    }
    i++;
  }

  return <>{elements}</>;
}

function inlineFormat(text: string): React.ReactNode {
  // Bold: **text**
  // Code: `text`
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} style={{ fontFamily: 'monospace', fontSize: '0.85em', background: 'var(--surface-raised)', padding: '0.1em 0.35em', borderRadius: '4px', border: '1px solid var(--border)' }}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </>
  );
}
