'use client';

import { useEffect, useRef, useState } from 'react';
import { useTask } from '@/hooks/use-task';
import { useTaskMessages } from '@/hooks/use-task-messages';
import { MessageFeed } from '@/components/message-feed';
import { ResultPanel } from '@/components/result-panel';
import { BrowserPreview } from '@/components/browser-preview';
import { saveReport } from '@/lib/report-store';
import type { Task } from 'agentex/resources';

const STATUS_LABEL: Record<string, string> = {
  RUNNING: 'Researching',
  COMPLETED: 'Complete',
  FAILED: 'Failed',
  CANCELED: 'Canceled',
  TERMINATED: 'Terminated',
  TIMED_OUT: 'Timed out',
  DELETED: 'Deleted',
};

const STATUS_COLOR: Record<string, string> = {
  RUNNING: 'var(--accent)',
  COMPLETED: 'var(--success)',
  FAILED: 'var(--error)',
  CANCELED: 'var(--text-secondary)',
  TERMINATED: 'var(--error)',
  TIMED_OUT: 'var(--warning)',
  DELETED: 'var(--text-secondary)',
};

function getTaskQuery(task: Task | undefined): string {
  if (!task) return '';
  const params = task.params as Record<string, unknown> | null | undefined;
  return (params?.query as string) ?? '';
}

type AnyContent = {
  type?: string;
  content?: unknown;
  name?: string;
  [key: string]: unknown;
};

const AGENT_TAG_RE = /^\[Agent (\d+)\] /;
const LAUNCH_RE = /^Launching (\d+) parallel research agents:\n([\s\S]+)$/;

/** Extract the plain-text content from a message, or null for non-text messages. */
function getTextContent(msg: { content: unknown }): string | null {
  const c = msg.content as AnyContent | null | undefined;
  if (!c) return null;
  if ((c.type === 'text' || !c.type) && typeof c.content === 'string') return c.content;
  return null;
}

interface AgentInfo {
  agentCount: number;
  subQueries: string[];
  agentMessages: string[][];
}

function parseAgentInfo(messages: { content: unknown }[] | undefined): AgentInfo {
  if (!messages) return { agentCount: 0, subQueries: [], agentMessages: [] };

  let agentCount = 0;
  let subQueries: string[] = [];

  // First pass: find "Launching N parallel research agents:" message
  for (const msg of messages) {
    const text = getTextContent(msg);
    if (!text) continue;
    const m = text.match(LAUNCH_RE);
    if (m) {
      agentCount = parseInt(m[1], 10);
      subQueries = m[2]
        .trim()
        .split('\n')
        .map(l => l.replace(/^\s*\d+\.\s*/, '').trim())
        .filter(Boolean);
      break;
    }
  }

  if (agentCount === 0) return { agentCount: 0, subQueries: [], agentMessages: [] };

  // Second pass: collect [Agent N] tagged messages per agent
  const agentMessages: string[][] = Array.from({ length: agentCount }, () => []);
  for (const msg of messages) {
    const text = getTextContent(msg);
    if (!text) continue;
    const m = text.match(AGENT_TAG_RE);
    if (m) {
      const idx = parseInt(m[1], 10); // 0-indexed
      if (idx >= 0 && idx < agentCount) {
        agentMessages[idx].push(text);
      }
    }
  }

  return { agentCount, subQueries, agentMessages };
}

function getFinishedAnswer(messages: { content: unknown }[] | undefined): string | null {
  if (!messages) return null;
  // Look for finish tool response or text message containing the structured answer
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content as unknown as AnyContent | null | undefined;
    if (!c) continue;

    // Tool response from finish activity
    if (c.type === 'tool_response' && c.name === 'finish') {
      const text = String(c.content ?? '');
      if (text.includes('## Summary') || text.includes('## Key Findings')) {
        return text;
      }
    }

    // Text message with structured markdown
    if ((c.type === 'text' || !c.type) && typeof c.content === 'string') {
      if (c.content.includes('## Summary') || c.content.includes('## Key Findings')) {
        return c.content;
      }
    }
  }
  return null;
}

export function ResearchView({ taskId }: { taskId: string }) {
  const { data: task, isLoading: taskLoading } = useTask(taskId);
  const { data: messages, isLoading: msgsLoading } = useTaskMessages(taskId);
  const [copied, setCopied] = useState(false);
  const savedRef = useRef(false);

  const status = task?.status ?? 'RUNNING';
  const isDone = status === 'COMPLETED' || status === 'FAILED';
  const query = getTaskQuery(task);
  const finalAnswer = getFinishedAnswer(messages);
  const hasAnswer = !!finalAnswer;
  const effectivelyDone = isDone || hasAnswer;
  const { agentCount, subQueries, agentMessages } = parseAgentInfo(messages);

  // Persist report to localStorage as soon as the answer arrives
  useEffect(() => {
    if (hasAnswer && finalAnswer && query && !savedRef.current) {
      savedRef.current = true;
      saveReport({ taskId, query, answer: finalAnswer, createdAt: new Date().toISOString() });
    }
  }, [hasAnswer, finalAnswer, query, taskId]);

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/r/${taskId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (taskLoading && !task) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0.75rem 1.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'var(--background)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{
          flex: 1,
          overflow: 'hidden',
        }}>
          <p style={{
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {query || taskId}
          </p>
        </div>

        <StatusBadge status={hasAnswer ? 'COMPLETED' : status} />

        {hasAnswer && (
          <button
            onClick={copyLink}
            style={{
              background: copied ? 'var(--success)' : 'var(--surface-raised)',
              color: copied ? 'white' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {copied ? '✓ Copied' : 'Share'}
          </button>
        )}
      </header>

      {/* Body: activity log (left) | browser/report (right) */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gap: 0,
        maxWidth: '1600px',
        margin: '0 auto',
        width: '100%',
      }}>
        {/* Left: activity log */}
        <div style={{
          borderRight: '1px solid var(--border)',
          padding: '1.5rem 1.25rem',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 49px)',
        }}>
          <h2 style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '1rem',
          }}>
            {effectivelyDone ? 'Research Log' : 'Live Activity'}
          </h2>
          {msgsLoading && !messages ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '2rem' }}>
              <Spinner />
            </div>
          ) : (
            <MessageFeed messages={messages ?? []} isRunning={!effectivelyDone} />
          )}
        </div>

        {/* Right: browser preview while running, report when done */}
        <div style={{
          padding: '1.5rem 2rem',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 49px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}>
          {/* Browser preview — visible while running, stays until report appears */}
          {!hasAnswer && (
            <>
              <SectionLabel>Browser</SectionLabel>
              <BrowserPreview
                taskId={taskId}
                isRunning={!effectivelyDone}
                agentCount={agentCount}
                subQueries={subQueries}
                agentMessages={agentMessages}
              />
            </>
          )}

          {/* Report — slides in when answer arrives */}
          {hasAnswer && finalAnswer && (
            <>
              <SectionLabel>Research Report</SectionLabel>
              <ResultPanel answer={finalAnswer} />
            </>
          )}

          {effectivelyDone && !finalAnswer && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {status === 'FAILED' ? 'Research failed. Check the activity log for details.' : 'Research complete.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 style={{
      fontSize: '0.75rem',
      fontWeight: 600,
      color: 'var(--text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      margin: 0,
    }}>
      {children}
    </h2>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? 'var(--text-secondary)';
  const isRunning = status === 'RUNNING';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
      padding: '0.25rem 0.75rem',
      borderRadius: '999px',
      background: `${color}22`,
      border: `1px solid ${color}44`,
      flexShrink: 0,
    }}>
      {isRunning && (
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      )}
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>
        {label}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" style={{ animation: 'spin 0.75s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
