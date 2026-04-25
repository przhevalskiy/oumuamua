'use client';

import { useState } from 'react';
import { ChibiAvatar, BUILDER_RING_COLORS } from '../chibi-avatar';
import {
  PLAN_READY_RE, LAUNCH_RE, STRATEGY_RE, KICKOFF_RE, FOLLOWUP_RE,
  builderColorIndex, seedBuilderColors, builderPurpose,
} from './agent-utils';

export function TextBubble({ text }: { text: string }) {
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

export function PlanReadyCard({ text }: { text: string }) {
  const m = text.match(PLAN_READY_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const tracks = m[2].trim().split(/\s*,\s*/).map(t => t.replace(/[…\.]+$/, '').trim()).filter(Boolean);
  const stackRaw = m[3]?.trim().replace(/…$/, '') ?? '';
  const stackItems = stackRaw ? stackRaw.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean) : [];

  seedBuilderColors(tracks);

  return (
    <div style={{
      borderRadius: '10px', border: '1px solid var(--border)',
      background: 'var(--surface)', overflow: 'hidden',
      marginBottom: '0.5rem',
    }}>
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

export function LaunchCard({ text }: { text: string }) {
  const m = text.match(LAUNCH_RE);
  if (!m) return <TextBubble text={text} />;
  const count = parseInt(m[1], 10);
  const tracks = m[2].split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean);
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

export function StrategyCard({ text }: { text: string }) {
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

export function KickoffCard({ text }: { text: string }) {
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

      <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '0.25rem' }}>
          Goal
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          {goal.trim()}
        </p>
      </div>

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

export function FollowUpCard({ text }: { text: string }) {
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
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          background: `color-mix(in srgb, ${AMBER} 15%, transparent)`,
          color: AMBER, borderRadius: '999px', padding: '0.1rem 0.5rem',
          border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`,
        }}>
          #{iteration}
        </span>
      </div>

      <div style={{ padding: '0.625rem 0.875rem', borderBottom: `1px solid color-mix(in srgb, ${AMBER} 12%, var(--border))` }}>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '0.25rem' }}>
          Request
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          {goal.trim()}
        </p>
      </div>

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
