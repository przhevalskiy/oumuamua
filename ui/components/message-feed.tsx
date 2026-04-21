'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TaskMessage } from 'agentex/resources';
import { ChibiAvatar, ROLE_TO_SPRITE, type SwarmRole } from './chibi-avatar';

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
  // swarm
  list_directory: '📁', read_file: '📄', write_file: '✏️',
  patch_file: '🔧', delete_file: '🗑️', run_command: '⚡',
  finish_build: '✅', report_plan: '📋',
};

const TOOL_LABELS: Record<string, string> = {
  search_web: 'Searching', navigate: 'Navigating', extract: 'Extracting',
  finish: 'Synthesizing', click_element: 'Clicking',
  list_directory: 'Listing directory', read_file: 'Reading file',
  write_file: 'Writing file', patch_file: 'Patching file',
  delete_file: 'Deleting file', run_command: 'Running command',
  finish_build: 'Build complete', report_plan: 'Reporting plan',
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

function agentSpriteIdxByType(type: AgentType, index: number): number {
  if (type === 'analyst') {
    const slots = [1, 3, 4, 6, 7, 8];
    return slots[index % slots.length];
  }
  return ROLE_TO_SPRITE[type] ?? 0;
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

function AgentRow({ text }: { text: string }) {
  const parsed = parseTaggedMessage(text);
  if (!parsed) return null;
  const { type, index, trackLabel, body } = parsed;
  const spriteIdx = agentSpriteIdxByType(type, index);
  const roleLabel = ROLE_LABEL[type] ?? type;
  const displayLabel = trackLabel ? `${roleLabel} · ${trackLabel}` : roleLabel;

  // Delegate to specialised cards for rich decision messages
  if (TRACK_BREAKDOWN_RE.test(body)) return <TrackBreakdownCard body={body} />;
  if (BUILDER_STEPS_RE.test(body)) return <BuilderStepsCard type={type} trackLabel={trackLabel} body={body} />;

  // Detect tool action: "tool_name: detail"
  const actionMatch = body.match(/^([a-z_]+):\s*([\s\S]*)/);
  const toolName = actionMatch ? actionMatch[1] : null;
  const toolDetail = actionMatch ? actionMatch[2].trim() : null;
  const isKnownTool = toolName && (TOOL_ICONS[toolName] !== undefined || toolName.includes('_'));
  const toolIcon = toolName ? (TOOL_ICONS[toolName] ?? '⚙️') : null;
  const toolLabel = toolName ? (TOOL_LABELS[toolName] ?? toolName) : null;
  const bodyText = (isKnownTool ? toolDetail : body.trim()) ?? '';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
      padding: '0.5rem 0.75rem',
      background: 'var(--surface-raised)', borderRadius: '10px',
      border: '1px solid var(--border)', marginBottom: '0.3rem',
    }}>
      <ChibiAvatar spriteIdx={spriteIdx} size={30} />
      <div style={{ minWidth: 0, flex: 1, paddingTop: '0.05rem' }}>
        <p style={{
          fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.6,
          marginBottom: '0.2rem',
        }}>
          {displayLabel}
        </p>
        {isKnownTool && toolLabel && (
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: bodyText ? '0.15rem' : 0 }}>
            {toolIcon} {toolLabel}
          </p>
        )}
        {bodyText && (
          <p style={{
            fontSize: '0.8rem', color: 'var(--text-secondary)',
            wordBreak: 'break-all', lineHeight: 1.5,
            fontFamily: (isKnownTool && toolDetail) ? 'monospace' : 'inherit',
          }}>
            {bodyText.length > 100 ? bodyText.slice(0, 100) + '…' : bodyText}
          </p>
        )}
        {!isKnownTool && !bodyText && body.trim() && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {body.trim().length > 120 ? body.trim().slice(0, 120) + '…' : body.trim()}
          </p>
        )}
      </div>
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

function BuilderStepsCard({ type, trackLabel, body }: { type: AgentType; trackLabel: string | null; body: string }) {
  const m = body.match(BUILDER_STEPS_RE);
  if (!m) return null;
  const header = m[1];
  const lines = m[2].split('\n').map(l => l.trim()).filter(Boolean);
  const isHealing = header === 'Healing';
  const displayLabel = trackLabel ? `Builder · ${trackLabel}` : 'Builder';

  return (
    <div style={{
      padding: '0.625rem 0.75rem', background: 'var(--surface-raised)',
      borderRadius: '10px', border: `1px solid ${isHealing ? 'color-mix(in srgb, var(--warning) 30%, transparent)' : 'var(--border)'}`,
      marginBottom: '0.3rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <ChibiAvatar role="builder" size={24} />
        <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
          {displayLabel} · {isHealing ? '🔧 Healing' : 'Starting'}
        </p>
      </div>
      <ol style={{ margin: 0, padding: '0 0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {lines.map((line, i) => (
          <li key={i} style={{
            fontSize: '0.775rem', color: 'var(--text-secondary)', lineHeight: 1.5,
            opacity: line.startsWith('…') ? 0.5 : 1,
            listStyle: line.startsWith('…') ? 'none' : 'decimal',
            marginLeft: line.startsWith('…') ? '-1.25rem' : 0,
          }}>
            {line.replace(/^\d+\.\s*/, '')}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Plan Ready card ───────────────────────────────────────────────────────────
const PLAN_READY_RE = /^Plan ready — (\d+) parallel track\(s\): ([^·\n]+)(?:·\s*stack:\s*(.+))?$/;

function PlanReadyCard({ text }: { text: string }) {
  const m = text.match(PLAN_READY_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const tracks = m[2].trim().split(/\s*,\s*/).map(t => t.replace(/…$/, '').trim()).filter(Boolean);
  const stack = m[3]?.trim() ?? '';

  return (
    <div style={{
      padding: '0.75rem', background: 'var(--surface-raised)',
      borderRadius: '10px', border: '1px solid var(--border)',
      marginBottom: '0.375rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <ChibiAvatar role="architect" size={26} />
        <p style={{
          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-secondary)',
        }}>
          Architect · Plan ready — {count} track{count > 1 ? 's' : ''}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: stack ? '0.5rem' : 0 }}>
        {tracks.map((t, i) => (
          <span key={i} style={{
            fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color: 'var(--accent)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            padding: '0.2rem 0.5rem', borderRadius: '5px',
          }}>
            {t}
          </span>
        ))}
      </div>

      {stack && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.6, fontFamily: 'monospace' }}>
          {stack}
        </p>
      )}
    </div>
  );
}

// ── Parallel launch card ──────────────────────────────────────────────────────
const LAUNCH_RE = /^Launching (\d+) parallel builders[^:]*:\s*(.+)$/;

function LaunchCard({ text }: { text: string }) {
  const m = text.match(LAUNCH_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const tracks = m[2].split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean);

  return (
    <div style={{
      padding: '0.75rem', background: 'var(--surface-raised)',
      borderRadius: '10px', border: '1px solid var(--border)',
      marginBottom: '0.375rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
        {/* stacked builder avatars */}
        <div style={{ display: 'flex' }}>
          {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
            <ChibiAvatar
              key={i} role="builder" size={26}
              style={{
                marginLeft: i === 0 ? 0 : -8,
                border: '2px solid var(--surface-raised)',
                zIndex: count - i, position: 'relative',
              }}
            />
          ))}
        </div>
        <p style={{
          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-secondary)',
        }}>
          Foreman · Launching {count} builders in parallel
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {tracks.map((t, i) => (
          <span key={i} style={{
            fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            color: 'var(--success)',
            border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
            padding: '0.2rem 0.5rem', borderRadius: '5px',
          }}>
            {t}
          </span>
        ))}
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
