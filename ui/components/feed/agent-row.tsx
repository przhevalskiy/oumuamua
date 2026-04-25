'use client';

import { useContext, useState } from 'react';
import { ChibiAvatar, BUILDER_RING_COLORS } from '../chibi-avatar';
import { ToolIcon, TOOL_LABELS } from './tool-icon';
import { BuilderProgressCtx } from './builder-progress';
import { PlanReadyCard } from './plan-cards';
import { TrackBreakdownCard, BuilderStepsCard } from './builder-cards';
import {
  parseTaggedMessage, agentSpriteIdxByType, ROLE_LABEL, ROLE_ACCENT,
  humanizeToolAction, builderColorIndex,
  PLAN_READY_RE, TRACK_BREAKDOWN_RE, BUILDER_STEPS_RE,
} from './agent-utils';

export function AgentRow({ text }: { text: string }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const parsed = parseTaggedMessage(text);
  if (!parsed) return null;
  const { type, index, trackLabel, body } = parsed;
  const spriteIdx = agentSpriteIdxByType(type, index);
  const roleLabel = ROLE_LABEL[type] ?? type;
  const displayLabel = trackLabel ? `${roleLabel} · ${trackLabel}` : roleLabel;
  const accent = ROLE_ACCENT[type] ?? 'var(--text-secondary)';

  if (PLAN_READY_RE.test(body)) return <PlanReadyCard text={body} />;
  if (TRACK_BREAKDOWN_RE.test(body)) return <TrackBreakdownCard body={body} />;
  if (BUILDER_STEPS_RE.test(body)) return <BuilderStepsCard type={type} trackLabel={trackLabel} body={body} index={index} />;

  const actionMatch = body.match(/^([a-z_]+):\s*([\s\S]*)/);
  const toolName = actionMatch ? actionMatch[1] : null;
  const toolDetail = actionMatch ? actionMatch[2].trim() : null;
  const isKnownTool = toolName && (TOOL_LABELS[toolName] !== undefined || toolName.includes('_'));
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
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              {toolName && <ToolIcon name={toolName} size={12} color="var(--text-secondary)" />}
              {humanLabel}
            </span>
          ) : bodyText ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {bodyText.length > 120 ? bodyText.slice(0, 120) + '…' : bodyText}
            </span>
          ) : null}
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
