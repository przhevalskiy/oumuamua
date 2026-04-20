'use client';

import { AgentCard, type AgentDef } from './agent-card';

const RESEARCH_AGENTS: AgentDef[] = [
  {
    step: 1,
    role: 'Strategist',
    tagline: 'Classifies the task, plans search queries, and decides how many agents to spawn (2–8 based on complexity).',
    why: 'Separates planning from doing. No other agent wastes tokens deciding what to research.',
    tools: ['LLM only'],
    mode: 'both',
    color: '#6366f1',
  },
  {
    step: 2,
    role: 'Scout',
    tagline: 'Runs 6–8 parallel web searches and returns a ranked list of URLs with relevance notes.',
    why: 'Search-only — never navigates, never gets distracted by content. Fast and focused.',
    tools: ['search_web'],
    mode: 'both',
    color: '#0ea5e9',
  },
  {
    step: 3,
    role: 'Analyst',
    tagline: 'Reads assigned URLs and extracts structured claims: what was said, where, verbatim quote, and confidence.',
    why: 'Deep reading only — no searching. Each analyst gets a different URL batch, so N analysts read N sources in parallel.',
    tools: ['navigate', 'report_claim', 'request_spawn'],
    mode: 'both',
    color: '#8b5cf6',
  },
  {
    step: 4,
    role: 'Critic',
    tagline: 'Reviews all claims across all analysts, flags contradictions, and requests verifiers for contested findings.',
    why: 'Without a critic layer, contradictions between sources go unnoticed. The critic is the only agent that sees everything.',
    tools: ['LLM only'],
    mode: 'research',
    color: '#f59e0b',
  },
  {
    step: 5,
    role: 'Verifier',
    tagline: 'Targets a single contested claim, searches for supporting or refuting evidence, and returns a verdict.',
    why: 'Only spawned for claims the Critic flags. Not every claim needs verification — this keeps cost bounded.',
    tools: ['search_web', 'navigate', 'report_verdict'],
    mode: 'research',
    color: '#ef4444',
  },
  {
    step: 6,
    role: 'Synthesizer',
    tagline: 'Assembles the final answer from verified and annotated claims, noting contradictions and confidence levels.',
    why: 'Works from structured claims, not raw page text. Every sentence in the output traces to a source.',
    tools: ['LLM only'],
    mode: 'research',
    color: '#10b981',
  },
  {
    step: 4,
    role: 'TaskPlanner',
    tagline: 'One LLM call converts the task and page context into a deterministic TaskPlan — an ordered list of steps.',
    why: 'The plan is produced once upfront. The Executor never calls an LLM — it just dispatches. Cheap and predictable.',
    tools: ['LLM only'],
    mode: 'execution',
    color: '#f97316',
  },
  {
    step: 5,
    role: 'Executor',
    tagline: 'Carries out the TaskPlan step by step. No reasoning — pure deterministic dispatch to browser and HTTP activities.',
    why: "Separating planning from execution means actions are fast, auditable, and don't consume reasoning tokens.",
    tools: ['fill_input', 'submit_form', 'http_request', 'navigate', 'click_element'],
    mode: 'execution',
    color: '#16a34a',
  },
];

const SWARM_AGENTS: AgentDef[] = [
  {
    step: 1,
    role: 'Foreman',
    tagline: 'Orchestrates the full swarm: dispatches agents in sequence, manages the heal loop, and blocks the PR if security fails.',
    why: 'The single source of truth for task state. If the IDE closes mid-run, Temporal rehydrates the Foreman and it continues.',
    tools: ['OrchestratorSkill'],
    mode: 'swarm',
    color: '#6366f1',
    spriteRole: 'foreman',
  },
  {
    step: 2,
    role: 'Architect',
    tagline: 'Reads the local repo, maps dependencies and entry points, and produces a structured implementation plan for the Builder.',
    why: 'The Builder should never guess at structure. The Architect reads first so the Builder writes with full context.',
    tools: ['list_directory', 'read_file', 'report_plan'],
    mode: 'swarm',
    color: '#0ea5e9',
    spriteRole: 'architect',
  },
  {
    step: 3,
    role: 'Builder',
    tagline: 'Executes the Architect\'s plan step by step — creating, patching, and deleting files. Re-invoked with heal instructions if QA fails.',
    why: 'Code writing is isolated from planning and testing. Each cycle is a clean, auditable set of file edits.',
    tools: ['read_file', 'write_file', 'patch_file', 'delete_file', 'run_command'],
    mode: 'swarm',
    color: '#8b5cf6',
    spriteRole: 'builder',
  },
  {
    step: 4,
    role: 'Inspector',
    tagline: 'Runs tests, lint, and type checks. If anything fails, produces concrete heal_instructions fed back to the Builder.',
    why: 'The self-healing loop. Up to N cycles of Builder → Inspector until checks pass or the limit is hit.',
    tools: ['run_tests', 'run_lint', 'run_type_check', 'read_file'],
    mode: 'swarm',
    color: '#f59e0b',
    spriteRole: 'inspector',
  },
  {
    step: 5,
    role: 'Security',
    tagline: 'Scans for committed secrets, vulnerable dependencies, and insecure patterns. Blocks the PR if critical or high findings exist.',
    why: 'A hard gate before any code reaches a PR. No critical finding goes unreviewed.',
    tools: ['scan_secrets', 'scan_dependencies', 'run_sast', 'read_file'],
    mode: 'swarm',
    color: '#ef4444',
    spriteRole: 'security',
  },
  {
    step: 6,
    role: 'DevOps',
    tagline: 'Creates the branch, stages all changes, commits with a conventional message, pushes, and opens a pull request.',
    why: 'Git operations are deterministic and isolated. The swarm never touches main directly.',
    tools: ['git_status', 'git_create_branch', 'git_add', 'git_commit', 'git_push', 'create_pull_request'],
    mode: 'swarm',
    color: '#16a34a',
    spriteRole: 'devops',
  },
];

const PIPELINE_RESEARCH = ['Strategist', 'Scout', 'Analysts ×N', 'Critic', 'Verifiers', 'Synthesizer'];
const PIPELINE_EXECUTION = ['Strategist', 'Scout', 'Analyst', 'TaskPlanner', 'Executor', 'Verifier'];
const PIPELINE_SWARM = ['Foreman', 'Architect', 'Builder', 'Inspector ↺', 'Security', 'DevOps'];

function PipelineRow({ steps, color, label }: { steps: string[]; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0' }}>
        {steps.map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.25rem 0.6rem',
              whiteSpace: 'nowrap',
            }}>
              {step}
            </span>
            {i < steps.length - 1 && (
              <span style={{ color: 'var(--text-secondary)', padding: '0 0.25rem', fontSize: '0.75rem' }}>→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentDirectory() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 2rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.375rem' }}>
          Agent Ecosystem
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Role-differentiated agents working in parallel. Each agent has exactly the tools it needs and nothing more.
        </p>
      </div>

      {/* Pipeline diagrams */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <PipelineRow steps={PIPELINE_RESEARCH} color="#6366f1" label="Research pipeline" />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <PipelineRow steps={PIPELINE_EXECUTION} color="#16a34a" label="Execution pipeline" />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <PipelineRow steps={PIPELINE_SWARM} color="#f97316" label="Swarm factory (durable)" />
      </div>

      {/* Research agents */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.875rem' }}>
          Research Pipeline
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
          {RESEARCH_AGENTS.filter(a => a.mode === 'research' || a.mode === 'both').map(a => (
            <AgentCard key={a.role} agent={a} />
          ))}
        </div>
      </div>

      {/* Execution agents */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.875rem' }}>
          Execution Pipeline
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
          {RESEARCH_AGENTS.filter(a => a.mode === 'execution' || a.mode === 'both').map(a => (
            <AgentCard key={a.role} agent={a} />
          ))}
        </div>
      </div>

      {/* Swarm agents */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
          <h2 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            Swarm Factory
          </h2>
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            color: '#f97316',
            background: '#f9731615',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Durable · Temporal-backed
          </span>
        </div>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Unlike research and execution agents, swarm agents survive failures. If the IDE closes mid-run,
          Temporal rehydrates the Foreman and the swarm continues from the last checkpoint.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
          {SWARM_AGENTS.map(a => <AgentCard key={a.role} agent={a} />)}
        </div>
      </div>

    </div>
  );
}
