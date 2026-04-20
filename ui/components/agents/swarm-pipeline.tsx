'use client';

import { buildSwarmPipeline, type SwarmAgentRow, type AgentStatus } from '@/lib/parse-agent-messages';

// ── Colors ────────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  Foreman:   '#6366f1',
  Architect: '#0ea5e9',
  Builder:   '#8b5cf6',
  Inspector: '#f59e0b',
  Security:  '#ef4444',
  DevOps:    '#16a34a',
};

const ROLE_ICON: Record<string, string> = {
  Foreman:   '⬡',
  Architect: '◈',
  Builder:   '⬡',
  Inspector: '◎',
  Security:  '⬡',
  DevOps:    '⬡',
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, small }: { status: AgentStatus; small?: boolean }) {
  const size = small ? '0.65rem' : '0.7rem';
  const pad = small ? '0.1rem 0.35rem' : '0.15rem 0.5rem';

  if (status === 'idle') return (
    <span style={{ fontSize: size, color: 'var(--text-secondary)', opacity: 0.4, padding: pad }}>
      waiting
    </span>
  );
  if (status === 'running') return (
    <span style={{
      fontSize: size, fontWeight: 600, padding: pad,
      color: '#d97706', background: '#d9770612', borderRadius: 999,
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
    }}>
      <PulsingDot /> running
    </span>
  );
  if (status === 'done') return (
    <span style={{ fontSize: size, fontWeight: 600, padding: pad, color: '#16a34a' }}>✓ done</span>
  );
  if (status === 'failed') return (
    <span style={{ fontSize: size, fontWeight: 600, padding: pad, color: '#dc2626' }}>✗ failed</span>
  );
  if (status === 'healing') return (
    <span style={{
      fontSize: size, fontWeight: 600, padding: pad,
      color: '#f97316', background: '#f9731612', borderRadius: 999,
    }}>
      ↺ healing
    </span>
  );
  return null;
}

function PulsingDot() {
  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: '#d97706', display: 'inline-block',
        animation: 'pulse-dot 1.2s ease-in-out infinite',
      }} />
    </>
  );
}

// ── Builder subtask row ───────────────────────────────────────────────────────

function SubtaskRow({ label, status, detail }: { label: string; status: AgentStatus; detail: string }) {
  const color = status === 'done' ? '#16a34a' : status === 'failed' ? '#dc2626' : status === 'running' ? '#8b5cf6' : '#888';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.3rem 0 0.3rem 1.5rem',
      borderLeft: `1.5px solid ${color}30`,
      marginLeft: '1.25rem',
    }}>
      {/* connector tick */}
      <span style={{ fontSize: '0.7rem', color, opacity: 0.6, flexShrink: 0 }}>
        {status === 'done' ? '✓' : status === 'failed' ? '✗' : status === 'running' ? '●' : '○'}
      </span>
      <span style={{
        fontSize: '0.75rem', fontFamily: 'monospace',
        color: status === 'idle' ? 'var(--text-secondary)' : 'var(--text-primary)',
        opacity: status === 'idle' ? 0.5 : 1,
        fontWeight: status === 'running' ? 500 : 400,
      }}>
        {label}
      </span>
      {status === 'running' && detail && (
        <span style={{
          fontSize: '0.7rem', color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0, opacity: 0.7,
        }}>
          {detail}
        </span>
      )}
    </div>
  );
}

// ── Agent pipeline row ────────────────────────────────────────────────────────

function PipelineRow({ row, isLast }: { row: SwarmAgentRow; isLast: boolean }) {
  const color = ROLE_COLOR[row.role] ?? '#888';
  const isActive = row.status === 'running' || row.status === 'healing';
  const hasSubtasks = row.subtasks.length > 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Vertical connector line */}
      {!isLast && (
        <div style={{
          position: 'absolute',
          left: 13,
          top: 32,
          bottom: 0,
          width: 1.5,
          background: row.status === 'idle'
            ? 'var(--border)'
            : row.status === 'done'
              ? color + '40'
              : color + '60',
          zIndex: 0,
        }} />
      )}

      {/* Main row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.625rem 0',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Role dot */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: row.status === 'idle' ? 'var(--surface-raised)' : color + '18',
          border: `1.5px solid ${row.status === 'idle' ? 'var(--border)' : color + '60'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', color: row.status === 'idle' ? 'var(--text-secondary)' : color,
          opacity: row.status === 'idle' ? 0.5 : 1,
          transition: 'all 0.2s ease',
          boxShadow: isActive ? `0 0 0 3px ${color}18` : 'none',
        }}>
          {row.status === 'done' ? '✓' : row.status === 'failed' ? '✗' : ROLE_ICON[row.role] ?? '●'}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: row.summary ? '0.2rem' : 0 }}>
            <span style={{
              fontSize: '0.875rem', fontWeight: 600,
              color: row.status === 'idle' ? 'var(--text-secondary)' : 'var(--text-primary)',
              opacity: row.status === 'idle' ? 0.5 : 1,
            }}>
              {row.role}
            </span>

            {/* Heal cycle badge */}
            {row.healCycle > 0 && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 600,
                color: '#f97316', background: '#f9731615',
                padding: '0.1rem 0.4rem', borderRadius: 999,
              }}>
                ×{row.healCycle + 1}
              </span>
            )}

            <StatusBadge status={row.status} />
          </div>

          {/* Status summary — the "manager briefing" line */}
          {row.summary && row.status !== 'idle' && (
            <p style={{
              fontSize: '0.8rem',
              color: row.status === 'failed' ? '#dc2626'
                : row.status === 'done' ? '#16a34a'
                : 'var(--text-secondary)',
              lineHeight: 1.4,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {row.summary}
            </p>
          )}
        </div>

        {/* Message count */}
        {row.messageCount > 0 && (
          <span style={{
            fontSize: '0.65rem', color: 'var(--text-secondary)',
            opacity: 0.5, flexShrink: 0, marginTop: 6,
          }}>
            {row.messageCount} msg{row.messageCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Builder subtasks */}
      {hasSubtasks && (
        <div style={{ marginBottom: '0.25rem' }}>
          {row.subtasks.map(sub => (
            <SubtaskRow key={sub.label} {...sub} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Overall progress bar ──────────────────────────────────────────────────────

function ProgressBar({ rows }: { rows: SwarmAgentRow[] }) {
  const total = rows.length;
  const done = rows.filter(r => r.status === 'done').length;
  const failed = rows.some(r => r.status === 'failed');
  const pct = Math.round((done / total) * 100);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {failed ? 'Blocked' : done === total ? 'Complete' : `${done} of ${total} stages done`}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: failed ? '#dc2626' : done === total ? '#16a34a' : 'var(--text-secondary)' }}>
          {pct}%
        </span>
      </div>
      <div style={{
        height: 4, borderRadius: 999,
        background: 'var(--surface-raised)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 999,
          background: failed ? '#dc2626' : done === total ? '#16a34a' : '#8b5cf6',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SwarmPipeline({ messages }: { messages: { content: string }[] }) {
  const rows = buildSwarmPipeline(messages);
  const anyActive = rows.some(r => r.status !== 'idle');

  if (!anyActive) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
          Swarm initializing...
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem 1.25rem' }}>
      <ProgressBar rows={rows} />
      <div>
        {rows.map((row, i) => (
          <PipelineRow key={row.role} row={row} isLast={i === rows.length - 1} />
        ))}
      </div>
    </div>
  );
}
