'use client';

import { useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentState = 'waiting' | 'live' | 'done';

interface AgentEvent {
  type: 'start' | 'search' | 'navigate' | 'click' | 'done' | 'other';
  detail: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AGENT_TAG_RE = /^\[Agent \d+\]\s*/;

function parseAgentMessage(msg: string): AgentEvent {
  const stripped = msg.replace(AGENT_TAG_RE, '');
  if (stripped.startsWith('Starting:')) {
    return { type: 'start', detail: stripped.replace('Starting:', '').trim() };
  }
  if (stripped.startsWith('search:')) {
    return { type: 'search', detail: stripped.replace('search:', '').trim().replace(/^"|"$/g, '') };
  }
  if (stripped.startsWith('navigate:')) {
    return { type: 'navigate', detail: stripped.replace('navigate:', '').trim() };
  }
  if (stripped.startsWith('click:')) {
    return { type: 'click', detail: stripped.replace('click:', '').trim() };
  }
  if (stripped === 'done') {
    return { type: 'done', detail: '' };
  }
  return { type: 'other', detail: stripped };
}

function isAgentDone(messages: string[], agentIndex: number): boolean {
  return messages.some(m => m === `[Agent ${agentIndex}] done`);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulsingDot({ color = 'var(--accent)', size = 7 }: { color?: string; size?: number }) {
  return (
    <>
      <style>{`@keyframes pulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style>
      <span style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        animation: 'pulseDot 1.2s ease-in-out infinite',
        flexShrink: 0,
      }} />
    </>
  );
}

const EVENT_CONFIG: Record<AgentEvent['type'], { icon: string; label: string; color: string }> = {
  start:    { icon: '🎯', label: 'Starting',   color: 'var(--text-secondary)' },
  search:   { icon: '🔍', label: 'Searching',  color: 'var(--accent)' },
  navigate: { icon: '🌐', label: 'Navigating', color: 'var(--text-primary)' },
  click:    { icon: '🖱️', label: 'Clicking',   color: 'var(--text-secondary)' },
  done:     { icon: '✅', label: 'Complete',   color: 'var(--success)' },
  other:    { icon: '⚙️', label: '',           color: 'var(--text-secondary)' },
};

function AgentEventCard({ event }: { event: AgentEvent }) {
  const cfg = EVENT_CONFIG[event.type];
  const showDetail = cfg.label && event.detail;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.5rem',
      padding: '0.4rem 0.625rem',
      background: 'var(--surface-raised)',
      borderRadius: '7px',
      border: '1px solid var(--border)',
      marginBottom: '0.3rem',
    }}>
      <span style={{ fontSize: '0.8125rem', lineHeight: 1.5, flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: cfg.color,
          marginBottom: showDetail ? '0.1rem' : 0,
        }}>
          {cfg.label || event.detail}
        </p>
        {showDetail && (
          <p style={{
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
            lineHeight: 1.4,
          }}>
            {event.detail.length > 90 ? event.detail.slice(0, 90) + '…' : event.detail}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Single-agent screenshot panel (original behaviour) ────────────────────────

function SingleAgentPreview({
  taskId,
  isRunning,
}: {
  taskId: string;
  isRunning: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<AgentState>('waiting');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning && state !== 'live') return;

    async function fetchScreenshot() {
      try {
        const res = await fetch(`/api/screenshot/${taskId}`, { cache: 'no-store' });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setState('live');
        }
      } catch {
        // not ready yet
      }
    }

    fetchScreenshot();
    intervalRef.current = setInterval(fetchScreenshot, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [taskId, isRunning, state]);

  useEffect(() => {
    if (!isRunning && state === 'live') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setState('done');
    }
  }, [isRunning, state]);

  return (
    <div style={{
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      position: 'relative',
      aspectRatio: '16 / 10',
      width: '100%',
    }}>
      {state === 'live' && isRunning && (
        <div style={{
          position: 'absolute',
          top: '0.625rem',
          left: '0.625rem',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          borderRadius: '999px',
          padding: '0.2rem 0.6rem',
        }}>
          <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'livePulse 1.2s ease-in-out infinite' }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white', letterSpacing: '0.06em' }}>LIVE</span>
        </div>
      )}
      {src ? (
        <img src={src} alt="Browser preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
          {isRunning ? (
            <>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ animation: 'spin 0.9s linear infinite', opacity: 0.5 }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span style={{ fontSize: '0.8125rem' }}>Waiting for first page...</span>
            </>
          ) : (
            <span style={{ fontSize: '0.8125rem' }}>No browser activity</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Per-agent tab panel ───────────────────────────────────────────────────────

function AgentTabPanel({
  taskId,
  agentIndex,
  subQuery,
  messages,
  isRunning,
  isVisible,
}: {
  taskId: string;
  agentIndex: number;
  subQuery: string;
  messages: string[];
  isRunning: boolean;
  isVisible: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<AgentState>('waiting');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const isDone = isAgentDone(messages, agentIndex);
  const agentRunning = isRunning && !isDone;

  // Always poll while agent is running — not just when tab is visible
  useEffect(() => {
    async function fetchScreenshot() {
      try {
        const res = await fetch(`/api/screenshot/${taskId}-sub-${agentIndex}`, { cache: 'no-store' });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setState('live');
        }
      } catch {
        // not ready yet
      }
    }

    if (!agentRunning && state !== 'live') return;

    fetchScreenshot();
    if (agentRunning) {
      intervalRef.current = setInterval(fetchScreenshot, 2000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [taskId, agentIndex, agentRunning, state]);

  useEffect(() => {
    if (!agentRunning && state === 'live') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setState('done');
    }
  }, [agentRunning, state]);

  // Auto-scroll feed when visible and running
  useEffect(() => {
    if (isVisible && agentRunning && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages.length, isVisible, agentRunning]);

  const events = messages.map(parseAgentMessage);

  return (
    <div style={{ display: isVisible ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Sub-query label */}
      {subQuery && (
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          lineHeight: 1.5,
          padding: '0.4rem 0.625rem',
          background: 'var(--surface-raised)',
          borderRadius: '7px',
          border: '1px solid var(--border)',
        }}>
          "{subQuery}"
        </p>
      )}

      {/* Screenshot */}
      <div style={{
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        position: 'relative',
        aspectRatio: '16 / 10',
        width: '100%',
        flexShrink: 0,
      }}>
        {state === 'live' && agentRunning && (
          <div style={{
            position: 'absolute',
            top: '0.5rem',
            left: '0.5rem',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)',
            borderRadius: '999px',
            padding: '0.15rem 0.5rem',
          }}>
            <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'livePulse 1.2s ease-in-out infinite' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'white', letterSpacing: '0.05em' }}>LIVE</span>
          </div>
        )}
        {src ? (
          <img
            src={src}
            alt={`Agent ${agentIndex + 1} browser`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            {agentRunning ? (
              <>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ animation: 'spin 0.9s linear infinite', opacity: 0.5 }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>Waiting for first page...</span>
              </>
            ) : isDone ? (
              <span style={{ fontSize: '0.75rem' }}>Research complete</span>
            ) : (
              <span style={{ fontSize: '0.75rem' }}>Waiting to start...</span>
            )}
          </div>
        )}
      </div>

      {/* Activity feed */}
      <div
        ref={feedRef}
        style={{ maxHeight: '14rem', overflowY: 'auto', paddingRight: '0.125rem' }}
      >
        {events.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {agentRunning && <PulsingDot />}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {agentRunning ? 'Starting...' : 'No activity yet'}
            </span>
          </div>
        ) : (
          <>
            {events.map((ev, i) => <AgentEventCard key={i} event={ev} />)}
            {agentRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.125rem' }}>
                <PulsingDot />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Researching...</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function BrowserPreview({
  taskId,
  isRunning,
  agentCount = 0,
  subQueries = [],
  agentMessages = [],
}: {
  taskId: string;
  isRunning: boolean;
  agentCount?: number;
  subQueries?: string[];
  agentMessages?: string[][];
}) {
  const [activeTab, setActiveTab] = useState(0);

  // Single-agent fallback
  if (agentCount <= 1) {
    return <SingleAgentPreview taskId={taskId} isRunning={isRunning} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: '0.3rem',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '0.5rem',
      }}>
        {Array.from({ length: agentCount }, (_, i) => {
          const msgs = agentMessages[i] ?? [];
          const isDone = isAgentDone(msgs, i);
          const isStarted = msgs.length > 0;
          const isActive = activeTab === i;

          return (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.3rem 0.65rem',
                borderRadius: '7px',
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {isDone ? (
                <span style={{ fontSize: '0.65rem', color: 'var(--success)' }}>✓</span>
              ) : isStarted && isRunning ? (
                <PulsingDot size={6} />
              ) : (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)', display: 'inline-block' }} />
              )}
              Agent {i + 1}
            </button>
          );
        })}
      </div>

      {/* All tab panels mounted; only active one visible */}
      {Array.from({ length: agentCount }, (_, i) => (
        <AgentTabPanel
          key={i}
          taskId={taskId}
          agentIndex={i}
          subQuery={subQueries[i] ?? ''}
          messages={agentMessages[i] ?? []}
          isRunning={isRunning}
          isVisible={activeTab === i}
        />
      ))}
    </div>
  );
}
