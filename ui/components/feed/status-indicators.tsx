'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskMessage } from 'agentex/resources';

export function PulsingDot() {
  return (
    <>
      <style>{`@keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulseDot 1.2s ease-in-out infinite', flexShrink: 0 }} />
    </>
  );
}

export function ThinkingDots({ label }: { label: string }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(id);
  }, []);
  return <span>{label}{dots}</span>;
}

export function ThinkingIndicator({ messages, taskStatus }: { messages: TaskMessage[]; taskStatus: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [sinceLastMsg, setSinceLastMsg] = useState(0);

  const lastMsgTime = useMemo(() => {
    if (messages.length === 0) return Date.now();
    const last = messages[messages.length - 1] as TaskMessage & { created_at?: string; createdAt?: string };
    const ts = last.created_at ?? last.createdAt;
    return ts ? new Date(ts).getTime() : Date.now();
  }, [messages]);

  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      setSinceLastMsg(Math.floor((Date.now() - lastMsgTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastMsgTime]);

  const label = taskStatus === 'RUNNING' ? 'Working' : taskStatus;
  const isThinking = sinceLastMsg >= 2;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', paddingBottom: '0.25rem' }}>
      <PulsingDot />
      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
        {isThinking ? (
          <ThinkingDots label={label} />
        ) : (
          label
        )}
      </span>
      {elapsed > 0 && (
        <span style={{
          marginLeft: 'auto', fontSize: '0.7rem',
          color: 'var(--text-secondary)', opacity: 0.4,
          fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
        }}>
          {elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}
        </span>
      )}
    </div>
  );
}

const TERMINAL_META: Record<string, { icon: string; label: string; color: string; detail: string }> = {
  TERMINATED: {
    icon: '⏹',
    label: 'Workflow stopped',
    color: 'var(--error)',
    detail: 'This build was manually stopped. Files written before the stop are preserved on disk.',
  },
  CANCELED: {
    icon: '✕',
    label: 'Workflow canceled',
    color: 'var(--text-secondary)',
    detail: 'This build was canceled before it could complete.',
  },
  TIMED_OUT: {
    icon: '⏱',
    label: 'Workflow timed out',
    color: 'var(--warning)',
    detail: 'The build exceeded its time limit. Partial files may exist on disk.',
  },
  FAILED: {
    icon: '✗',
    label: 'Workflow failed',
    color: 'var(--error)',
    detail: 'The build encountered an unrecoverable error.',
  },
  DELETED: {
    icon: '🗑',
    label: 'Workflow deleted',
    color: 'var(--text-secondary)',
    detail: 'This workflow has been deleted.',
  },
};

export function WorkflowTerminalBanner({ status }: { status: string }) {
  const meta = TERMINAL_META[status] ?? {
    icon: '●',
    label: status,
    color: 'var(--text-secondary)',
    detail: 'Workflow is no longer running.',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
      marginTop: '0.75rem',
      padding: '0.625rem 0.875rem',
      background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
      borderRadius: '8px',
    }}>
      <span style={{ fontSize: '0.9rem', flexShrink: 0, marginTop: '0.05rem' }}>{meta.icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: meta.color }}>{meta.label}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{meta.detail}</span>
      </div>
    </div>
  );
}
