'use client';

import { useContext, useState } from 'react';
import { ChibiAvatar, BUILDER_RING_COLORS } from '../chibi-avatar';
import { ToolIcon, TOOL_LABELS } from './tool-icon';
import { BuilderProgressCtx } from './builder-progress';
import { TRACK_BREAKDOWN_RE, BUILDER_STEPS_RE, summariseStep, builderColorIndex, type AgentType } from './agent-utils';

export function ToolUseCard({ name, args }: { name: string; args: Record<string, unknown> }) {
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
      <span style={{ lineHeight: 1.5, opacity: 0.6, marginTop: '0.1rem', color: 'var(--text-secondary)' }}>
        <ToolIcon name={name} size={14} />
      </span>
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

export function TrackBreakdownCard({ body }: { body: string }) {
  const m = body.match(TRACK_BREAKDOWN_RE);
  if (!m) return null;
  const [expanded, setExpanded] = useState<string | null>(null);

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
        {blocks.map(({ label, steps }) => {
          const isOpen = expanded === label;
          const preview = steps.slice(0, 3).map(summariseStep);
          const overflow = steps.length - 3;
          return (
            <div key={label}>
              <p style={{
                fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace',
                color: 'var(--accent)', marginBottom: '0.25rem',
              }}>
                {label}
              </p>
              {!isOpen && (
                <>
                  <ol style={{ margin: 0, padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    {preview.map((s, i) => (
                      <li key={i} style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {s}
                      </li>
                    ))}
                  </ol>
                  {overflow > 0 && (
                    <button
                      onClick={() => setExpanded(label)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '0.72rem', color: 'var(--accent)', padding: '0.2rem 0 0 1.1rem',
                        fontFamily: 'inherit', opacity: 0.7,
                      }}
                    >
                      +{overflow} more steps
                    </button>
                  )}
                </>
              )}
              {isOpen && (
                <>
                  <ol style={{ margin: 0, padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    {steps.map((s, i) => (
                      <li key={i} style={{
                        fontSize: '0.775rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                        opacity: s.startsWith('…') ? 0.5 : 1,
                        listStyle: s.startsWith('…') ? 'none' : 'decimal',
                        marginLeft: s.startsWith('…') ? '-1rem' : 0,
                      }}>
                        {summariseStep(s)}
                      </li>
                    ))}
                  </ol>
                  <button
                    onClick={() => setExpanded(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0.2rem 0 0 1.1rem',
                      fontFamily: 'inherit', opacity: 0.6,
                    }}
                  >
                    Show less
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BuilderStepsCard({ type, trackLabel, body, index }: { type: AgentType; trackLabel: string | null; body: string; index: number }) {
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
          {isHealing ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <ToolIcon name="patch_file" size={12} color="var(--text-secondary)" /> Healing
            </span>
          ) : 'Starting'} — {lines.length} steps
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
