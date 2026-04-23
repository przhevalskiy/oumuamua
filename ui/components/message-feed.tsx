'use client';

import { useEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from 'react';
import type { TaskMessage } from 'agentex/resources';
import { ChibiAvatar, ROLE_TO_SPRITE, BUILDER_RING_COLORS, type SwarmRole } from './chibi-avatar';

// ── Builder progress tracking ─────────────────────────────────────────────────

interface BuilderProg { total: number; done: number; finished: boolean }
type BuilderProgMap = Map<string, BuilderProg>;

const BuilderProgressCtx = createContext<BuilderProgMap>(new Map());

const PROGRESS_TOOLS = new Set(['write_file', 'patch_file', 'run_command', 'delete_file', 'finish_build']);
// Builder tag regex — matches [Builder 1], [Builder (track-name)], [Builder]
const BUILDER_TAG_RE = /^\[Builder(?:\s+(\d+)|\s+\(([^)]+)\))?\]\s*/i;

function computeBuilderProgress(messages: TaskMessage[]): BuilderProgMap {
  const map = new Map<string, BuilderProg>();

  for (const msg of messages) {
    const c = msg.content as { type?: string; content?: unknown } | null | undefined;
    const text = (c?.type === 'text' || !c?.type) && typeof c?.content === 'string' ? c.content : '';
    if (!text) continue;

    const tagMatch = text.match(BUILDER_TAG_RE);
    if (!tagMatch) continue;

    // key = track label if present, else numeric index string, else '0'
    const key = tagMatch[2] ?? tagMatch[1] ?? '0';
    const body = text.slice(tagMatch[0].length).trim();

    // "Starting:\n..." — sets the planned total (preserves any done already counted)
    const stepsMatch = body.match(/^(Starting|Healing):\n([\s\S]+)$/);
    if (stepsMatch) {
      const total = stepsMatch[2].split('\n').map(l => l.trim()).filter(Boolean).length;
      const existing = map.get(key);
      map.set(key, { total, done: existing?.done ?? 0, finished: existing?.finished ?? false });
      continue;
    }

    // finish_build — mark done
    if (body.startsWith('finish_build:')) {
      const e = map.get(key) ?? { total: 0, done: 0, finished: false };
      map.set(key, { ...e, finished: true, done: Math.max(e.done, e.total) });
      continue;
    }

    // Substantive tool actions — increment done even if Starting hasn't appeared yet
    const toolMatch = body.match(/^([a-z_]+):/);
    if (toolMatch && PROGRESS_TOOLS.has(toolMatch[1])) {
      const e = map.get(key) ?? { total: 0, done: 0, finished: false };
      if (!e.finished) {
        map.set(key, { ...e, done: e.total > 0 ? Math.min(e.done + 1, e.total) : e.done + 1 });
      }
    }
  }

  return map;
}

type MsgContent = {
  type?: string;
  content?: unknown;
  name?: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
};

// ── Tool metadata ─────────────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, string> = {
  // research
  search_web: '🔍', navigate: '🌐', extract: '📄',
  finish: '✅', click_element: '🖱️',
  // swarm — file ops
  list_directory: '📁', read_file: '📄', write_file: '✏️',
  patch_file: '🔧', delete_file: '🗑️', run_command: '⚡',
  finish_build: '✅', report_plan: '📋',
  // swarm — Phase 1-4 new tools
  verify_build: '🔬',   // builder self-verification
  find_symbol: '🔎',    // semantic symbol search
  query_index: '📇',    // repo index lookup
  run_coverage: '📊',   // test coverage measurement
  str_replace_editor: '✏️',
  install_packages: '📦',
  git_diff: '🔀',
  run_migration: '🗄️',
  execute_sql: '🗄️',
  fetch_url: '🌐',
  run_tests: '🧪',
  run_lint: '🔍',
  run_type_check: '🔬',
  run_application: '🚀',
  memory_read: '🧠',
  memory_write: '🧠',
  memory_search_episodes: '🧠',
};

const TOOL_LABELS: Record<string, string> = {
  search_web: 'Searching', navigate: 'Navigating', extract: 'Extracting',
  finish: 'Synthesizing', click_element: 'Clicking',
  list_directory: 'Listing directory', read_file: 'Reading file',
  write_file: 'Writing file', patch_file: 'Patching file',
  delete_file: 'Deleting file', run_command: 'Running command',
  finish_build: 'Build complete', report_plan: 'Reporting plan',
  // Phase 1-4 new tools
  verify_build: 'Verifying build',
  find_symbol: 'Finding symbol',
  query_index: 'Querying index',
  run_coverage: 'Measuring coverage',
  str_replace_editor: 'Editing file',
  install_packages: 'Installing packages',
  git_diff: 'Checking diff',
  run_migration: 'Running migration',
  execute_sql: 'Querying database',
  fetch_url: 'Fetching URL',
  run_tests: 'Running tests',
  run_lint: 'Linting',
  run_type_check: 'Type checking',
  run_application: 'Starting application',
  memory_read: 'Reading memory',
  memory_write: 'Writing memory',
  memory_search_episodes: 'Searching episodes',
};

// ── Agent tag parser ──────────────────────────────────────────────────────────
// Handles: [Builder], [Builder 1], [Builder (track-name)], [Foreman], etc.
const TAGGED_RE = /^\[(PM|Foreman|Architect|Builder|Inspector|Security|DevOps|Scout|Agent|Analyst|Verifier|Critic)(?:\s+(\d+)|\s+\(([^)]+)\))?\]\s*/;

type AgentType = SwarmRole;

function parseTaggedMessage(text: string): {
  type: AgentType;
  index: number;
  trackLabel: string | null;
  body: string;
} | null {
  const m = text.match(TAGGED_RE);
  if (!m) return null;
  const rawType = m[1].toLowerCase();
  const index = m[2] != null ? parseInt(m[2], 10) : 0;
  const trackLabel = m[3] ?? null;
  const body = text.slice(m[0].length);
  const type: AgentType = (rawType === 'agent' || rawType === 'analyst')
    ? 'analyst'
    : (rawType as AgentType);
  return { type, index, trackLabel, body };
}

// Single source of truth: assign color slots in first-seen order so the
// LaunchCard positions and per-message AgentRow colors always agree.
const _trackColorRegistry = new Map<string, number>();

function builderColorIndex(index: number, trackLabel: string | null): number {
  const key = trackLabel ?? String(index);
  if (!_trackColorRegistry.has(key)) {
    _trackColorRegistry.set(key, _trackColorRegistry.size);
  }
  return _trackColorRegistry.get(key)!;
}

// Pre-register all tracks from the launch message so the registry is
// populated in order before any builder rows render.
function seedBuilderColors(tracks: string[]) {
  tracks.forEach((t, i) => {
    if (!_trackColorRegistry.has(t)) _trackColorRegistry.set(t, i);
  });
}

function agentSpriteIdxByType(type: AgentType, index: number): number {
  if (type === 'analyst') {
    // cycle through a few visually distinct avatars for parallel analysts
    const slots = [13, 15, 19, 23, 5, 9];
    return slots[index % slots.length];
  }
  return ROLE_TO_SPRITE[type as SwarmRole] ?? 1;
}

export { TAGGED_RE };
export type { AgentType };

// ── Role display names ────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  pm: 'PM', foreman: 'Foreman', architect: 'Architect', builder: 'Builder',
  inspector: 'Inspector', security: 'Security', devops: 'DevOps',
  scout: 'Scout', analyst: 'Analyst', verifier: 'Verifier', critic: 'Critic',
};

// ── Components ────────────────────────────────────────────────────────────────

function ToolUseCard({ name, args }: { name: string; args: Record<string, unknown> }) {
  const icon = TOOL_ICONS[name] ?? '⚙️';
  const label = TOOL_LABELS[name] ?? name;

  let detail = '';
  if (name === 'search_web') detail = String(args.query ?? '');
  else if (name === 'navigate') detail = String(args.url ?? '');
  else if (name === 'finish') detail = 'Writing structured report...';
  else if (name === 'click_element') detail = String(args.selector ?? '');

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
      padding: '0.5rem 0.75rem',
      background: 'var(--surface-raised)', borderRadius: '8px',
      border: '1px solid var(--border)', marginBottom: '0.3rem',
    }}>
      <span style={{ fontSize: '0.875rem', lineHeight: 1.5, opacity: 0.7 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}
        </p>
        {detail && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7, wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

const ROLE_ACCENT: Record<string, string> = {
  foreman:   '#f97316', // orange
  pm:        '#8b5cf6', // violet
  architect: '#3b82f6', // blue
  builder:   '#10b981', // emerald
  inspector: '#f59e0b', // amber
  security:  '#ef4444', // red
  devops:    '#06b6d4', // cyan
  scout:     '#6366f1', // indigo
  analyst:   '#ec4899', // pink
  verifier:  '#14b8a6', // teal
  critic:    '#f43f5e', // rose
};

// Translate a raw tool call into a sentence a human would understand
function humanizeToolAction(toolName: string, detail: string): string {
  const d = detail.trim();
  const filename = d.split('/').pop() ?? d;

  if (toolName === 'write_file') {
    if (filename.includes('package')) return `Setting up package configuration`;
    if (filename.match(/\.(tsx?|jsx?)$/)) return `Writing ${filename}`;
    if (filename.match(/\.(css|scss|sass)$/)) return `Styling ${filename}`;
    if (filename.match(/\.(json|yaml|yml|toml)$/)) return `Configuring ${filename}`;
    if (filename.match(/\.(md|txt)$/)) return `Documenting ${filename}`;
    if (filename.match(/dockerfile/i)) return `Writing Dockerfile`;
    return `Writing ${filename}`;
  }

  if (toolName === 'patch_file') return `Updating ${filename}`;
  if (toolName === 'read_file') return `Reading ${filename}`;
  if (toolName === 'delete_file') return `Removing ${filename}`;
  if (toolName === 'list_directory') return `Exploring project structure`;
  if (toolName === 'finish_build') return `Finishing build`;
  if (toolName === 'report_plan') return `Drafting build plan`;
  if (toolName === 'str_replace_editor') return `Editing ${filename}`;
  if (toolName === 'install_packages') return `Installing ${d.split(' ').slice(0, 3).join(' ')}`;
  if (toolName === 'git_diff') return `Reviewing changes`;
  if (toolName === 'run_migration') return `Running database migration`;
  if (toolName === 'execute_sql') return `Querying database`;
  if (toolName === 'fetch_url') return `Fetching ${d.replace(/^https?:\/\//, '').split('/')[0]}`;
  if (toolName === 'run_tests') return `Running test suite`;
  if (toolName === 'run_lint') return `Linting codebase`;
  if (toolName === 'run_type_check') return `Type checking`;
  if (toolName === 'run_coverage') return `Measuring test coverage`;
  if (toolName === 'run_application') return `Starting application`;
  if (toolName === 'memory_read') return `Loading build context`;
  if (toolName === 'memory_write') return `Saving build context`;
  if (toolName === 'memory_search_episodes') return `Searching past builds`;
  if (toolName === 'verify_build') return `Verifying build (lint + types)`;
  if (toolName === 'find_symbol') return `Finding ${d} in codebase`;
  if (toolName === 'query_index') return `Looking up ${d} in index`;

  if (toolName === 'run_command') {
    const cmd = d.replace(/^cd\s+\S+\s*&&\s*/, '').trim();
    if (/^npm (i|install)/.test(cmd)) return `Installing dependencies`;
    if (/^npm run build/.test(cmd)) return `Building the project`;
    if (/^npm run dev/.test(cmd)) return `Starting dev server`;
    if (/^npm (run )?test/.test(cmd)) return `Running test suite`;
    if (/^npm create/.test(cmd)) return `Scaffolding project with ${cmd.match(/vite|create-react|next|remix|astro/i)?.[0] ?? 'template'}`;
    if (/^npx/.test(cmd)) return `Running ${cmd.split(' ')[1] ?? 'tool'}`;
    if (/^git init/.test(cmd)) return `Initialising git repository`;
    if (/^git add|git commit/.test(cmd)) return `Committing changes`;
    if (/^git/.test(cmd)) return `Running git command`;
    if (/^find\s/.test(cmd) && cmd.includes('-type f')) return `Scanning source files`;
    if (/^ls\s/.test(cmd) || cmd === 'ls') return `Checking directory contents`;
    if (/^mkdir/.test(cmd)) return `Creating directory structure`;
    if (/^rm\s/.test(cmd)) return `Removing files`;
    if (/^cp\s|^mv\s/.test(cmd)) return `Moving files`;
    if (/^cat\s/.test(cmd)) return `Reading file contents`;
    if (/^echo\s/.test(cmd)) return `Writing file contents`;
    if (/^chmod|^chown/.test(cmd)) return `Setting permissions`;
    if (/^curl|^wget/.test(cmd)) return `Fetching remote resource`;
    if (/^python|^python3/.test(cmd)) return `Running Python script`;
    if (/^node\s/.test(cmd)) return `Running Node.js script`;
    return `Running shell command`;
  }

  return toolName.replace(/_/g, ' ');
}

function AgentRow({ text }: { text: string }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const parsed = parseTaggedMessage(text);
  if (!parsed) return null;
  const { type, index, trackLabel, body } = parsed;
  const spriteIdx = agentSpriteIdxByType(type, index);
  const roleLabel = ROLE_LABEL[type] ?? type;
  const displayLabel = trackLabel ? `${roleLabel} · ${trackLabel}` : roleLabel;
  const accent = ROLE_ACCENT[type] ?? 'var(--text-secondary)';

  // Delegate to specialised cards for rich decision messages
  if (PLAN_READY_RE.test(body)) return <PlanReadyCard text={body} />;
  if (TRACK_BREAKDOWN_RE.test(body)) return <TrackBreakdownCard body={body} />;
  if (BUILDER_STEPS_RE.test(body)) return <BuilderStepsCard type={type} trackLabel={trackLabel} body={body} index={index} />;

  // Detect tool action: "tool_name: detail"
  const actionMatch = body.match(/^([a-z_]+):\s*([\s\S]*)/);
  const toolName = actionMatch ? actionMatch[1] : null;
  const toolDetail = actionMatch ? actionMatch[2].trim() : null;
  const isKnownTool = toolName && (TOOL_ICONS[toolName] !== undefined || toolName.includes('_'));
  const toolIcon = toolName ? (TOOL_ICONS[toolName] ?? '⚙️') : null;
  const hasRawDetail = !!(isKnownTool && toolDetail);
  const humanLabel = (isKnownTool && toolName) ? humanizeToolAction(toolName, toolDetail ?? '') : null;
  const bodyText = (!isKnownTool ? body.trim() : '') ?? '';

  const ringColor = type === 'builder'
    ? BUILDER_RING_COLORS[builderColorIndex(index, trackLabel) % BUILDER_RING_COLORS.length]
    : undefined;

  const labelColor = ringColor ?? accent;
  const progMap = useContext(BuilderProgressCtx);
  const builderProg = type === 'builder' ? progMap.get(trackLabel ?? String(index)) : undefined;

  return (
    <div style={{
      borderLeft: `2px solid ${labelColor}25`,
      padding: '0.375rem 0 0.375rem 0.625rem',
      marginBottom: '0.125rem',
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
        <div style={{
          flexShrink: 0, borderRadius: '50%',
          padding: ringColor ? '2px' : 0,
          background: ringColor ?? 'transparent',
        }}>
          <ChibiAvatar spriteIdx={spriteIdx} size={22} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: labelColor, opacity: 0.85,
            marginRight: '0.4rem',
          }}>
            {displayLabel}
          </span>
          {builderProg?.finished && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--success)', marginRight: '0.25rem' }}>✓</span>
          )}
          {humanLabel ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {toolIcon} {humanLabel}
            </span>
          ) : bodyText ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {bodyText.length > 120 ? bodyText.slice(0, 120) + '…' : bodyText}
            </span>
          ) : null}
          {/* Expand raw detail toggle */}
          {hasRawDetail && (
            <button
              onClick={() => setDetailOpen(o => !o)}
              style={{
                marginLeft: '0.375rem', cursor: 'pointer',
                padding: '0.15rem 0.4rem', borderRadius: '4px',
                fontSize: '0.65rem', color: 'var(--text-secondary)',
                fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                background: detailOpen ? 'var(--surface-raised)' : 'transparent',
                border: '1px solid var(--border)',
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-secondary)';
              }}
              onMouseLeave={e => {
                if (!detailOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                style={{ width: 11, height: 11 }}>
                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              <span>raw</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                style={{ width: 9, height: 9, transition: 'transform 0.12s', transform: detailOpen ? 'rotate(180deg)' : 'none' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* Raw command / path — expandable */}
      {hasRawDetail && detailOpen && (
        <div style={{ marginTop: '0.35rem', marginLeft: '2.375rem', marginRight: '0.5rem' }}>
          <pre style={{
            margin: 0, padding: '0.5rem 0.75rem',
            background: 'var(--surface-raised)', borderRadius: '6px',
            fontSize: '0.72rem', fontFamily: 'monospace',
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            border: '1px solid var(--border)',
            lineHeight: 1.6,
          }}>
            {toolDetail!.length > 400 ? toolDetail!.slice(0, 400) + '…' : toolDetail}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Track breakdown card (Architect decision detail) ─────────────────────────
const TRACK_BREAKDOWN_RE = /^Track breakdown:\n([\s\S]+)$/;

function TrackBreakdownCard({ body }: { body: string }) {
  const m = body.match(TRACK_BREAKDOWN_RE);
  if (!m) return null;

  const blocks = m[1].split(/\n\n+/).map(block => {
    const lines = block.trim().split('\n');
    const label = lines[0].replace(/:$/, '').trim();
    const steps = lines.slice(1).map(l => l.trim()).filter(Boolean);
    return { label, steps };
  }).filter(b => b.label);

  return (
    <div style={{
      padding: '0.75rem', background: 'var(--surface-raised)',
      borderRadius: '10px', border: '1px solid var(--border)',
      marginBottom: '0.375rem',
    }}>
      <p style={{
        fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--text-secondary)',
        marginBottom: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.375rem',
      }}>
        <ChibiAvatar role="architect" size={18} />
        Architect · Track breakdown
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {blocks.map(({ label, steps }) => (
          <div key={label}>
            <p style={{
              fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace',
              color: 'var(--accent)', marginBottom: '0.25rem',
            }}>
              {label}
            </p>
            <ol style={{ margin: 0, padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {steps.map((s, i) => (
                <li key={i} style={{
                  fontSize: '0.775rem', color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  opacity: s.startsWith('…') ? 0.5 : 1,
                  listStyle: s.startsWith('…') ? 'none' : 'decimal',
                  marginLeft: s.startsWith('…') ? '-1rem' : 0,
                }}>
                  {s.replace(/^\d+\.\s*/, '')}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Builder step list card ────────────────────────────────────────────────────
const BUILDER_STEPS_RE = /^(Starting|Healing):\n([\s\S]+)$/;

function BuilderStepsCard({ type, trackLabel, body, index }: { type: AgentType; trackLabel: string | null; body: string; index: number }) {
  const [open, setOpen] = useState(false);
  const m = body.match(BUILDER_STEPS_RE);
  if (!m) return null;
  const header = m[1];
  const lines = m[2].split('\n').map(l => l.trim()).filter(Boolean);
  const isHealing = header === 'Healing';
  const displayLabel = trackLabel ? `Builder · ${trackLabel}` : 'Builder';
  const accent = BUILDER_RING_COLORS[builderColorIndex(index, trackLabel) % BUILDER_RING_COLORS.length];
  const progMap = useContext(BuilderProgressCtx);
  const progKey = trackLabel ?? String(index);
  const prog = progMap.get(progKey);
  const hasTotal = prog && prog.total > 0;
  const pct = prog
    ? prog.finished ? 100
      : hasTotal ? Math.round((prog.done / prog.total) * 100)
      : 0
    : 0;

  return (
    <div style={{
      borderLeft: `2px solid ${accent}30`,
      padding: '0.375rem 0 0.5rem 0.625rem',
      marginBottom: '0.125rem',
    }}>
      {/* Summary row — always visible */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', borderRadius: '6px', padding: '0.2rem 0.4rem 0.2rem 0.2rem', marginLeft: '-0.2rem' }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-raised)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        <div style={{ flexShrink: 0, borderRadius: '50%', padding: '2px', background: accent }}>
          <ChibiAvatar role="builder" size={22} />
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: accent, opacity: 0.9 }}>
          {displayLabel}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {isHealing ? '🔧 Healing' : 'Starting'} — {lines.length} steps
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
          {prog && (
            prog.finished ? (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--success)' }}>Done ✓</span>
            ) : hasTotal ? (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: accent, opacity: 0.8 }}>
                {prog.done}/{prog.total}
              </span>
            ) : prog.done > 0 ? (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: accent, opacity: 0.7 }}>
                {prog.done} actions
              </span>
            ) : null
          )}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ width: 13, height: 13, color: 'var(--text-secondary)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      {prog && (
        <div style={{ marginTop: '0.3rem', marginLeft: '0.2rem', marginRight: '0.4rem' }}>
          <style>{`@keyframes indeterminate { 0%{transform:translateX(-100%)} 100%{transform:translateX(500%)} }`}</style>
          <div style={{
            height: 3, borderRadius: 999,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            overflow: 'hidden', position: 'relative',
          }}>
            {prog.finished ? (
              <div style={{ height: '100%', width: '100%', background: 'var(--success)', borderRadius: 999 }} />
            ) : hasTotal ? (
              <div style={{
                height: '100%', width: `${pct}%`,
                background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                borderRadius: 999, transition: 'width 0.4s ease',
              }} />
            ) : (
              <div style={{
                position: 'absolute', height: '100%', width: '30%',
                background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                animation: 'indeterminate 1.6s ease-in-out infinite',
              }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', opacity: 0.45 }}>
              {prog.finished ? 'Complete' : hasTotal ? `${pct}% complete` : `${prog.done} actions taken`}
            </span>
            {!prog.finished && hasTotal && (
              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', opacity: 0.45 }}>
                {prog.total - prog.done} remaining
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expandable steps */}
      {open && (
        <ol style={{ margin: '0.375rem 0 0 2.5rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          {lines.map((line, i) => {
            const done = prog ? i < prog.done : false;
            return (
              <li key={i} style={{
                fontSize: '0.75rem', lineHeight: 1.6,
                listStyleType: 'decimal', marginLeft: '1rem',
                color: done ? 'var(--text-primary)' : 'var(--text-secondary)',
                opacity: done ? 1 : 0.6,
              }}>
                {line.replace(/^\d+\.\s*/, '')}
                {done && <span style={{ marginLeft: '0.3rem', color: 'var(--success)', fontSize: '0.65rem' }}>✓</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ── Plan Ready card ───────────────────────────────────────────────────────────
const PLAN_READY_RE = /^Plan ready — (\d+) parallel track\(s\): ([^·\n]+)(?:·\s*stack:\s*(.+))?$/;

function PlanReadyCard({ text }: { text: string }) {
  const m = text.match(PLAN_READY_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const tracks = m[2].trim().split(/\s*,\s*/).map(t => t.replace(/[…\.]+$/, '').trim()).filter(Boolean);
  const stackRaw = m[3]?.trim().replace(/…$/, '') ?? '';
  const stackItems = stackRaw ? stackRaw.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean) : [];

  // Seed registry so builder colors are consistent with later activity rows
  seedBuilderColors(tracks);

  return (
    <div style={{
      borderRadius: '10px', border: '1px solid var(--border)',
      background: 'var(--surface)', overflow: 'hidden',
      marginBottom: '0.5rem',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.5rem 0.875rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        background: 'color-mix(in srgb, #3b82f6 6%, transparent)',
      }}>
        <ChibiAvatar role="architect" size={20} />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>
          Architect has finalized a <span style={{ color: 'var(--text-primary)' }}>build plan</span>
        </span>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          background: 'color-mix(in srgb, #3b82f6 15%, transparent)',
          color: '#3b82f6', borderRadius: '999px', padding: '0.1rem 0.5rem',
          border: '1px solid color-mix(in srgb, #3b82f6 30%, transparent)',
        }}>
          {count} track{count > 1 ? 's' : ''}
        </span>
      </div>

      {/* Track rows */}
      <div style={{ padding: '0.375rem 0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {tracks.map((track, i) => {
          const color = BUILDER_RING_COLORS[builderColorIndex(0, track) % BUILDER_RING_COLORS.length];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.3rem 0.5rem',
              background: `color-mix(in srgb, ${color} 7%, transparent)`,
              borderRadius: '6px',
              border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', flex: 1 }}>
                {track}
              </span>
              <span style={{ fontSize: '0.65rem', color, fontWeight: 600, opacity: 0.8 }}>
                {builderPurpose(track).role}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tech stack */}
      {stackItems.length > 0 && (
        <div style={{
          padding: '0.4rem 0.875rem 0.5rem',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.45, marginRight: '0.25rem' }}>
            Stack
          </span>
          {stackItems.map((s, i) => (
            <span key={i} style={{
              fontSize: '0.72rem', fontWeight: 500, fontFamily: 'monospace',
              background: 'var(--surface-raised)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              padding: '0.1rem 0.45rem', borderRadius: '4px',
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Parallel launch card ──────────────────────────────────────────────────────
const LAUNCH_RE = /^Launching (\d+) parallel builders[^:]*:\s*(.+)$/;

// Derive a human-readable purpose sentence from an arbitrary track name
function builderPurpose(track: string): { role: string; goal: string } {
  const norm = track.toLowerCase().replace(/[-_]/g, ' ');
  const kw = (w: string) => norm.includes(w);

  if (kw('scaffold') || kw('setup') || kw('init') || kw('bootstrap'))
    return { role: 'Project Scaffolder', goal: 'Initialises the repository structure, installs dependencies, configures build tools, and lays the foundation all other builders build on.' };
  if (kw('auth') || kw('login') || kw('session') || kw('jwt') || kw('oauth'))
    return { role: 'Auth Engineer', goal: 'Implements the full authentication surface — registration, login, password reset, session tokens, and route guards.' };
  if (kw('dashboard') || kw('layout') || kw('shell') || kw('nav') || kw('sidebar'))
    return { role: 'Layout Architect', goal: 'Builds the app shell, navigation, sidebar, and dashboard skeleton that houses every page.' };
  if (kw('api') || kw('backend') || kw('server') || kw('route') || kw('endpoint'))
    return { role: 'API Engineer', goal: 'Creates server-side routes, controllers, middleware, and wires data models to HTTP endpoints.' };
  if (kw('db') || kw('database') || kw('model') || kw('schema') || kw('migrat'))
    return { role: 'Data Engineer', goal: 'Designs and migrates the database schema, writes ORM models, and seeds initial data.' };
  if (kw('ui') || kw('component') || kw('design') || kw('style') || kw('theme') || kw('tailwind') || kw('css'))
    return { role: 'UI Specialist', goal: 'Crafts reusable components, applies the design system, and ensures visual consistency across screens.' };
  if (kw('test') || kw('spec') || kw('e2e') || kw('unit') || kw('cypress') || kw('jest') || kw('vitest'))
    return { role: 'QA Engineer', goal: 'Writes unit, integration, and end-to-end test suites to verify correctness and prevent regressions.' };
  if (kw('deploy') || kw('ci') || kw('docker') || kw('infra') || kw('devops') || kw('pipeline'))
    return { role: 'DevOps Engineer', goal: 'Configures CI/CD pipelines, Dockerfiles, environment variables, and deployment scripts.' };
  if (kw('feature') || kw('module') || kw('page') || kw('view') || kw('screen'))
    return { role: 'Feature Builder', goal: `Owns the end-to-end implementation of the "${track.replace(/[-_]/g, ' ')}" feature — components, logic, and data flow.` };
  if (kw('check') || kw('compliance') || kw('audit') || kw('report') || kw('log'))
    return { role: 'Compliance Engineer', goal: `Implements "${track.replace(/[-_]/g, ' ')}" — tracking, reporting, and audit trail functionality.` };

  // Generic fallback
  const friendly = track.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { role: 'Builder', goal: `Responsible for delivering the "${friendly}" work stream — writing files, running commands, and leaving the code ready for review.` };
}

function LaunchCard({ text }: { text: string }) {
  const m = text.match(LAUNCH_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const tracks = m[2].split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean);
  // Seed the registry in order so downstream AgentRows share the same slots
  seedBuilderColors(tracks);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div style={{
      borderRadius: '10px',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      overflow: 'hidden',
      marginBottom: '0.5rem',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.5rem 0.875rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
      }}>
        <ChibiAvatar role="foreman" size={20} />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>
          Foreman dispatching <span style={{ color: 'var(--text-primary)' }}>{count} builders</span> in parallel
        </span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
            <div key={i} style={{
              borderRadius: '50%', padding: '2px',
              background: BUILDER_RING_COLORS[i % BUILDER_RING_COLORS.length],
              marginLeft: i === 0 ? 0 : -6,
              position: 'relative', zIndex: count - i,
            }}>
              <ChibiAvatar role="builder" size={22} />
            </div>
          ))}
        </div>
      </div>

      {/* Track list */}
      <div style={{ padding: '0.375rem 0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {tracks.map((track, i) => {
          const color = BUILDER_RING_COLORS[builderColorIndex(0, track) % BUILDER_RING_COLORS.length];
          const isOpen = openIdx === i;
          const { role, goal } = builderPurpose(track);
          return (
            <div key={i} style={{
              borderRadius: '7px',
              border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
              background: `color-mix(in srgb, ${color} 6%, transparent)`,
              overflow: 'hidden',
            }}>
              {/* Summary row */}
              <div
                onClick={() => setOpenIdx(isOpen ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.35rem 0.5rem', cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `color-mix(in srgb, ${color} 12%, transparent)`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <div style={{ borderRadius: '50%', padding: '2px', background: color, flexShrink: 0 }}>
                  <ChibiAvatar role="builder" size={18} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', flex: 1 }}>
                  {track}
                </span>
                <span style={{ fontSize: '0.65rem', color, fontWeight: 600, opacity: 0.8, marginRight: '0.25rem' }}>
                  {role}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: 12, height: 12, color: 'var(--text-secondary)', flexShrink: 0, transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {/* Expanded goal */}
              {isOpen && (
                <div style={{
                  padding: '0.375rem 0.75rem 0.5rem 2.5rem',
                  borderTop: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
                }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                    {goal}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Strategy card (legacy research) ──────────────────────────────────────────
const STRATEGY_RE = /^\[Strategy\] Deploying (\d+) specialist agents:\n([\s\S]*)/;

function StrategyCard({ text }: { text: string }) {
  const m = text.match(STRATEGY_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const personas = m[2].trim().split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
  const analystSlots = [1, 3, 4, 6, 7, 8];

  return (
    <div style={{
      padding: '0.75rem', background: 'var(--surface-raised)',
      borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '0.375rem',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Deploying {count} specialist agents
      </p>
      <div style={{ display: 'flex', marginBottom: '0.625rem' }}>
        {personas.map((_, i) => (
          <ChibiAvatar key={i} spriteIdx={analystSlots[i % analystSlots.length]} size={28}
            style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--surface-raised)', zIndex: personas.length - i, position: 'relative' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {personas.map((persona, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <ChibiAvatar spriteIdx={analystSlots[i % analystSlots.length]} size={18} style={{ marginTop: 2 }} />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>{persona}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HITL approval parsing ─────────────────────────────────────────────────────

const APPROVAL_REQUEST_PREFIX = '__approval_request__';
const APPROVAL_RESOLVED_PREFIX = '__approval_resolved__';

type ApprovalPayload = {
  checkpoint: string;
  action: string;
  workflow_id: string;
};

type ResolvedPayload = {
  checkpoint: string;
  approved: boolean;
  workflow_id: string;
};

function parseApprovalRequest(text: string): ApprovalPayload | null {
  if (!text.startsWith(APPROVAL_REQUEST_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(APPROVAL_REQUEST_PREFIX.length)) as ApprovalPayload;
  } catch { return null; }
}

function parseApprovalResolved(text: string): ResolvedPayload | null {
  if (!text.startsWith(APPROVAL_RESOLVED_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(APPROVAL_RESOLVED_PREFIX.length)) as ResolvedPayload;
  } catch { return null; }
}

const CHECKPOINT_LABELS: Record<string, string> = {
  architect_plan: 'Build Plan Review',
  max_heals:      'Heal Limit Reached',
  devops:         'Deployment Approval',
};

function ApprovalCard({
  payload,
  taskId,
  autoApprove,
}: {
  payload: ApprovalPayload;
  taskId: string;
  autoApprove: boolean;
}) {
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(false);
  const ACCENT = '#f97316';

  const sendSignal = useCallback(async (approved: boolean) => {
    if (decided || loading) return;
    setLoading(true);
    try {
      await fetch(`/api/tasks/${taskId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: payload.workflow_id, approved }),
      });
      setDecided(approved ? 'approved' : 'rejected');
    } catch {
      // leave in pending state so user can retry
    } finally {
      setLoading(false);
    }
  }, [decided, loading, taskId, payload.workflow_id]);

  // Auto-approve when flag is set
  useEffect(() => {
    if (autoApprove && !decided && !loading) {
      sendSignal(true);
    }
  }, [autoApprove, decided, loading, sendSignal]);

  const label = CHECKPOINT_LABELS[payload.checkpoint] ?? 'Approval Required';
  const borderColor = decided === 'approved' ? '#22c55e' : decided === 'rejected' ? '#ef4444' : ACCENT;

  return (
    <div style={{
      margin: '0.75rem 0',
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--surface)',
      opacity: decided ? 0.75 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 0.875rem',
        background: `${borderColor}12`,
        borderBottom: `1px solid ${borderColor}30`,
      }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: borderColor }}>
          {label}
        </span>
        {decided && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: decided === 'approved' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {decided === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </span>
        )}
      </div>

      {/* Action text */}
      <div style={{ padding: '0.75rem 0.875rem' }}>
        <p style={{ fontSize: '0.8375rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
          {payload.action}
        </p>
      </div>

      {/* Buttons */}
      {!decided && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0 0.875rem 0.75rem' }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => sendSignal(true)}
            style={{
              flex: 1, padding: '0.45rem 0', borderRadius: '8px',
              background: '#22c55e', border: 'none', color: 'white',
              fontSize: '0.8125rem', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            {loading ? '…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => sendSignal(false)}
            style={{
              flex: 1, padding: '0.45rem 0', borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem', fontWeight: 400, cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ── Clarification card (PM questions) ────────────────────────────────────────

const CLARIFICATION_REQUEST_PREFIX = '__clarification_request__';
const CLARIFICATION_RESOLVED_PREFIX = '__clarification_resolved__';

type ClarificationPayload = {
  questions: string[];
  context?: string;
  workflow_id: string;
};

function parseClarificationRequest(text: string): ClarificationPayload | null {
  if (!text.startsWith(CLARIFICATION_REQUEST_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(CLARIFICATION_REQUEST_PREFIX.length)) as ClarificationPayload;
  } catch { return null; }
}

function ClarificationCard({
  payload,
  taskId,
  autoApprove,
}: {
  payload: ClarificationPayload;
  taskId: string;
  autoApprove: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const ACCENT = '#f97316';

  const sendAnswers = useCallback(async (skip = false) => {
    if (submitted || loading) return;
    setLoading(true);
    try {
      const answerPayload = skip
        ? {}
        : Object.fromEntries(payload.questions.map(q => [q, answers[q] ?? '']));
      await fetch(`/api/tasks/${taskId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: payload.workflow_id,
          signal: 'submit',
          payload: answerPayload,
        }),
      });
      setSubmitted(true);
    } catch {
      // leave open so user can retry
    } finally {
      setLoading(false);
    }
  }, [submitted, loading, taskId, payload, answers]);

  // Auto-approve skips clarification immediately
  useEffect(() => {
    if (autoApprove && !submitted && !loading) {
      sendAnswers(true);
    }
  }, [autoApprove, submitted, loading, sendAnswers]);

  return (
    <div style={{
      margin: '0.75rem 0',
      border: `1px solid ${submitted ? 'var(--border)' : ACCENT}`,
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--surface)',
      opacity: submitted ? 0.75 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 0.875rem',
        background: submitted ? 'transparent' : `${ACCENT}12`,
        borderBottom: `1px solid ${submitted ? 'var(--border)' : `${ACCENT}30`}`,
      }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: submitted ? 'var(--text-secondary)' : ACCENT }}>
          Project Manager · Clarification
        </span>
        {submitted && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>
            ✓ Submitted
          </span>
        )}
      </div>

      <div style={{ padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Context summary */}
        {payload.context && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, fontStyle: 'italic', opacity: 0.8 }}>
            {payload.context}
          </p>
        )}

        {/* Questions */}
        {payload.questions.map((q, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
              {i + 1}. {q}
            </p>
            {!submitted && (
              <input
                type="text"
                placeholder="Your answer…"
                value={answers[q] ?? ''}
                onChange={e => setAnswers(prev => ({ ...prev, [q]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') sendAnswers(false); }}
                style={{
                  width: '100%', padding: '0.45rem 0.625rem',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            )}
            {submitted && answers[q] && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '0.75rem', borderLeft: `2px solid ${ACCENT}40` }}>
                {answers[q]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Buttons */}
      {!submitted && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0 0.875rem 0.75rem' }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => sendAnswers(false)}
            style={{
              flex: 2, padding: '0.45rem 0', borderRadius: '8px',
              background: ACCENT, border: 'none', color: 'white',
              fontSize: '0.8125rem', fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            {loading ? '…' : 'Submit answers'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => sendAnswers(true)}
            style={{
              flex: 1, padding: '0.45rem 0', borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem', fontWeight: 400,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ── Swarm kickoff card ────────────────────────────────────────────────────────

const KICKOFF_RE = /^Swarm Factory activated\.\nGoal:\s*(.+)\nRepo:\s*(.+?)\s*\|\s*Branch:\s*(.+)$/s;
const FOLLOWUP_RE = /^Swarm Factory re-activated \(follow-up #(\d+)\)\.\nGoal:\s*(.+)\nRepo:\s*(.+?)\s*\|\s*Branch:\s*(.+)$/s;

function KickoffCard({ text }: { text: string }) {
  const m = text.match(KICKOFF_RE);
  if (!m) return null;
  const [, goal, repo, branch] = m;
  const repoName = repo.split('/').pop() ?? repo;
  return (
    <div style={{
      borderRadius: '10px',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      overflow: 'hidden',
      marginBottom: '0.5rem',
    }}>
      {/* Header strip */}
      <div style={{
        padding: '0.5rem 0.875rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
      }}>
        <ChibiAvatar role="foreman" size={20} />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Swarm Factory
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600,
          background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
          color: 'var(--accent)', borderRadius: '999px', padding: '0.1rem 0.5rem',
        }}>
          Activated
        </span>
      </div>

      {/* Goal */}
      <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '0.25rem' }}>
          Goal
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          {goal.trim()}
        </p>
      </div>

      {/* Repo + Branch */}
      <div style={{ padding: '0.5rem 0.875rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.45, marginBottom: '0.15rem' }}>Repo</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', margin: 0 }} title={repo}>
            {repoName}
          </p>
        </div>
        <div>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.45, marginBottom: '0.15rem' }}>Branch</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', margin: 0 }}>
            {branch.trim()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Follow-up triage card ─────────────────────────────────────────────────────

function FollowUpCard({ text }: { text: string }) {
  const m = text.match(FOLLOWUP_RE);
  if (!m) return null;
  const [, iterStr, goal, repo, branch] = m;
  const iteration = parseInt(iterStr, 10);
  const repoName = repo.split('/').pop() ?? repo;
  const AMBER = '#f59e0b';

  return (
    <div style={{
      borderRadius: '10px',
      border: `1px solid color-mix(in srgb, ${AMBER} 30%, var(--border))`,
      background: 'var(--surface)',
      overflow: 'hidden',
      marginBottom: '0.5rem',
      marginTop: '0.75rem',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.5rem 0.875rem',
        borderBottom: `1px solid color-mix(in srgb, ${AMBER} 20%, var(--border))`,
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: `color-mix(in srgb, ${AMBER} 8%, transparent)`,
      }}>
        <ChibiAvatar role="foreman" size={20} />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
          Follow-up received
        </span>
        {/* Iteration counter */}
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          background: `color-mix(in srgb, ${AMBER} 15%, transparent)`,
          color: AMBER, borderRadius: '999px', padding: '0.1rem 0.5rem',
          border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`,
        }}>
          #{iteration}
        </span>
      </div>

      {/* Request */}
      <div style={{ padding: '0.625rem 0.875rem', borderBottom: `1px solid color-mix(in srgb, ${AMBER} 12%, var(--border))` }}>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '0.25rem' }}>
          Request
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          {goal.trim()}
        </p>
      </div>

      {/* Meta row — repo + branch + visual "continuing" indicator */}
      <div style={{ padding: '0.4rem 0.875rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: AMBER, opacity: 0.6, flexShrink: 0 }}>
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }} title={repo}>
            {repoName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: AMBER, opacity: 0.6, flexShrink: 0 }}>
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {branch.trim()}
          </span>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: AMBER, opacity: 0.6, fontWeight: 500 }}>
          continuing from build {iteration - 1}
        </span>
      </div>
    </div>
  );
}

function TextBubble({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500 && !trimmed.includes('##')) return null;
  return (
    <div style={{ padding: '0.25rem 0', marginBottom: '0.2rem' }}>
      <p style={{ fontSize: '0.8375rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', opacity: 0.8 }}>
        {trimmed.length > 400 ? trimmed.slice(0, 400) + '…' : trimmed}
      </p>
    </div>
  );
}

// ── Message router ────────────────────────────────────────────────────────────

function MessageRow({ message, taskId, autoApprove }: { message: TaskMessage; taskId: string; autoApprove: boolean }) {
  const c = message.content as unknown as MsgContent;
  if (!c) return null;
  const msgType = c.type;

  if (msgType === 'tool_request') {
    return <ToolUseCard name={c.name ?? ''} args={(c.arguments ?? {}) as Record<string, unknown>} />;
  }
  if (msgType === 'tool_response') return null;

  if (msgType === 'text' || !msgType) {
    const text = typeof c.content === 'string' ? c.content : '';
    if (!text.trim()) return null;

    // HITL: approval checkpoints
    const approvalPayload = parseApprovalRequest(text);
    if (approvalPayload) return <ApprovalCard payload={approvalPayload} taskId={taskId} autoApprove={autoApprove} />;
    if (parseApprovalResolved(text)) return null;

    // HITL: PM clarification questions
    const clarifyPayload = parseClarificationRequest(text);
    if (clarifyPayload) return <ClarificationCard payload={clarifyPayload} taskId={taskId} autoApprove={autoApprove} />;
    if (text.startsWith(CLARIFICATION_RESOLVED_PREFIX)) return null;

    if (text.startsWith('## Swarm Factory Report')) return null;
    if (FOLLOWUP_RE.test(text)) return <FollowUpCard text={text} />;
    if (KICKOFF_RE.test(text)) return <KickoffCard text={text} />;
    if (STRATEGY_RE.test(text)) return <StrategyCard text={text} />;
    if (TAGGED_RE.test(text)) {
      const parsed = parseTaggedMessage(text);
      if (parsed?.type === 'foreman' && LAUNCH_RE.test(parsed.body)) {
        return <LaunchCard text={parsed.body} />;
      }
      return <AgentRow text={text} />;
    }
    if (PLAN_READY_RE.test(text)) return <PlanReadyCard text={text} />;
    if (LAUNCH_RE.test(text)) return <LaunchCard text={text} />;
    return <TextBubble text={text} />;
  }

  return null;
}

// ── Feed ──────────────────────────────────────────────────────────────────────

export function MessageFeed({
  messages,
  isRunning,
  taskId,
  autoApprove = false,
}: {
  messages: TaskMessage[];
  isRunning: boolean;
  taskId: string;
  autoApprove?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const builderProgress = useMemo(() => computeBuilderProgress(messages), [messages]);

  useEffect(() => {
    if (isRunning) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isRunning]);

  if (messages.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', paddingTop: '3rem', color: 'var(--text-secondary)' }}>
        {isRunning && <PulsingDot />}
        <p style={{ fontSize: '0.875rem' }}>{isRunning ? 'Agent starting up...' : 'No activity recorded.'}</p>
      </div>
    );
  }

  return (
    <BuilderProgressCtx.Provider value={builderProgress}>
    <div>
      {messages.map((msg) => <MessageRow key={msg.id} message={msg} taskId={taskId} autoApprove={autoApprove} />)}
      {isRunning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem' }}>
          <PulsingDot />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Working...</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
    </BuilderProgressCtx.Provider>
  );
}

function PulsingDot() {
  return (
    <>
      <style>{`@keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulseDot 1.2s ease-in-out infinite', flexShrink: 0 }} />
    </>
  );
}
