'use client';

import { ChibiAvatar, type SwarmRole } from '@/components/chibi-avatar';

type Mode = 'research' | 'execution' | 'both' | 'swarm';

export type AgentDef = {
  role: string;
  tagline: string;
  why: string;
  tools: string[];
  mode: Mode;
  step: number;
  color: string;
  spriteRole?: SwarmRole;
};

const MODE_LABEL: Record<Mode, string> = {
  research: 'Research',
  execution: 'Execution',
  both: 'Both',
  swarm: 'Swarm',
};

const MODE_COLOR: Record<Mode, string> = {
  research: '#6366f1',
  execution: '#16a34a',
  both: '#d97706',
  swarm: '#f97316',
};

export function AgentCard({ agent }: { agent: AgentDef }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      transition: 'box-shadow 0.15s ease',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {agent.spriteRole ? (
            <ChibiAvatar role={agent.spriteRole} size={32} />
          ) : (
            <span style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: agent.color + '22',
              border: `1.5px solid ${agent.color}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.65rem',
              fontWeight: 700,
              color: agent.color,
              flexShrink: 0,
              letterSpacing: '-0.01em',
            }}>
              {agent.step}
            </span>
          )}
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {agent.role}
          </span>
        </div>
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 500,
          color: MODE_COLOR[agent.mode],
          background: MODE_COLOR[agent.mode] + '15',
          padding: '0.2rem 0.5rem',
          borderRadius: '999px',
          flexShrink: 0,
        }}>
          {MODE_LABEL[agent.mode]}
        </span>
      </div>

      {/* Tagline */}
      <p style={{ fontSize: '0.8375rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {agent.tagline}
      </p>

      {/* Why */}
      <p style={{
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        fontStyle: 'italic',
        borderLeft: `2px solid ${agent.color}44`,
        paddingLeft: '0.625rem',
        lineHeight: 1.5,
        opacity: 0.8,
      }}>
        {agent.why}
      </p>

      {/* Tools */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {agent.tools.map(tool => (
          <span key={tool} style={{
            fontSize: '0.7rem',
            fontFamily: 'monospace',
            background: 'var(--surface-raised)',
            color: 'var(--text-secondary)',
            padding: '0.15rem 0.5rem',
            borderRadius: '4px',
            border: '1px solid var(--border)',
          }}>
            {tool}
          </span>
        ))}
      </div>
    </div>
  );
}
