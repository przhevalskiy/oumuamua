'use client';

import { useEffect, useRef } from 'react';
import type { TaskMessage } from 'agentex/resources';

type MsgContent = {
  type?: string;
  content?: unknown;
  name?: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
};

const TOOL_ICONS: Record<string, string> = {
  search_web: '🔍',
  navigate: '🌐',
  extract: '📄',
  finish: '✅',
  click_element: '🖱️',
};

const TOOL_LABELS: Record<string, string> = {
  search_web: 'Searching',
  navigate: 'Navigating',
  extract: 'Extracting',
  finish: 'Synthesizing answer',
  click_element: 'Clicking',
};

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
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.625rem',
      padding: '0.625rem 0.875rem',
      background: 'var(--surface-raised)',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      marginBottom: '0.5rem',
    }}>
      <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--accent)',
          marginBottom: detail ? '0.2rem' : 0,
        }}>
          {label}
        </p>
        {detail && (
          <p style={{
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
            lineHeight: 1.5,
          }}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

function TextBubble({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Skip raw page dumps — only show short thinking text
  if (trimmed.length > 500 && !trimmed.includes('##')) return null;

  return (
    <div style={{ padding: '0.375rem 0', marginBottom: '0.25rem' }}>
      <p style={{
        fontSize: '0.875rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
      }}>
        {trimmed.length > 400 ? trimmed.slice(0, 400) + '…' : trimmed}
      </p>
    </div>
  );
}

function MessageRow({ message }: { message: TaskMessage }) {
  const c = message.content as unknown as MsgContent;
  if (!c) return null;

  const msgType = c.type;

  if (msgType === 'tool_request') {
    return (
      <ToolUseCard
        name={c.name ?? ''}
        args={(c.arguments ?? {}) as Record<string, unknown>}
      />
    );
  }

  if (msgType === 'tool_response') {
    // Skip raw tool responses (page content)
    return null;
  }

  if (msgType === 'text' || !msgType) {
    const text = typeof c.content === 'string' ? c.content : '';
    // Agent-tagged messages belong in the per-agent tab feed, not here
    if (/^\[Agent \d+\]/.test(text)) return null;
    return <TextBubble text={text} />;
  }

  return null;
}

export function MessageFeed({
  messages,
  isRunning,
}: {
  messages: TaskMessage[];
  isRunning: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRunning) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isRunning]);

  if (messages.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        paddingTop: '3rem',
        color: 'var(--text-secondary)',
      }}>
        {isRunning && <PulsingDot />}
        <p style={{ fontSize: '0.875rem' }}>
          {isRunning ? 'Agent starting up...' : 'No activity recorded.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      {messages.map((msg) => (
        <MessageRow key={msg.id} message={msg} />
      ))}
      {isRunning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem' }}>
          <PulsingDot />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Thinking...</span>
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
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: 'var(--accent)',
        display: 'inline-block',
        animation: 'pulseDot 1.2s ease-in-out infinite',
        flexShrink: 0,
      }} />
    </>
  );
}
