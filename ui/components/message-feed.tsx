'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { TaskMessage } from 'agentex/resources';

import { BuilderProgressCtx, computeBuilderProgress } from './feed/builder-progress';
import { ToolUseCard } from './feed/builder-cards';
import { PlanReadyCard, LaunchCard, StrategyCard, KickoffCard, FollowUpCard, TextBubble } from './feed/plan-cards';
import { ApprovalCard, ClarificationCard } from './feed/hitl-cards';
import { PulsingDot, ThinkingIndicator, WorkflowTerminalBanner } from './feed/status-indicators';
import { AgentRow } from './feed/agent-row';
import {
  type MsgContent,
  TAGGED_RE, PLAN_READY_RE, LAUNCH_RE, STRATEGY_RE, KICKOFF_RE, FOLLOWUP_RE,
  parseTaggedMessage, parseApprovalRequest, parseApprovalResolved,
  parseClarificationRequest,
  CLARIFICATION_RESOLVED_PREFIX,
  APPROVAL_RESOLVED_PREFIX,
} from './feed/agent-utils';

export { TAGGED_RE };
export type { AgentType } from './feed/agent-utils';

function MessageRow({ message, taskId, autoApprove, allMessages }: { message: TaskMessage; taskId: string; autoApprove: boolean; allMessages: TaskMessage[] }) {
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

    const approvalPayload = parseApprovalRequest(text);
    if (approvalPayload) {
      const resolvedMsg = allMessages.find(m => {
        const mc = m.content as unknown as MsgContent;
        const mt = typeof mc?.content === 'string' ? mc.content : '';
        const resolved = parseApprovalResolved(mt);
        return resolved?.workflow_id === approvalPayload.workflow_id;
      });
      const resolvedPayload = resolvedMsg
        ? parseApprovalResolved((resolvedMsg.content as unknown as MsgContent)?.content as string)
        : null;
      return <ApprovalCard payload={approvalPayload} taskId={taskId} autoApprove={autoApprove} resolvedState={resolvedPayload?.approved === true ? 'approved' : resolvedPayload?.approved === false ? 'rejected' : null} />;
    }
    if (text.startsWith(APPROVAL_RESOLVED_PREFIX)) return null;

    const clarifyPayload = parseClarificationRequest(text);
    if (clarifyPayload) {
      const resolvedMsg = allMessages.find(m => {
        const mc = m.content as unknown as MsgContent;
        const mt = typeof mc?.content === 'string' ? mc.content : '';
        if (!mt.startsWith(CLARIFICATION_RESOLVED_PREFIX)) return false;
        try {
          const r = JSON.parse(mt.slice(CLARIFICATION_RESOLVED_PREFIX.length));
          return r.workflow_id === clarifyPayload.workflow_id;
        } catch { return false; }
      });
      return (
        <ClarificationCard
          payload={clarifyPayload}
          taskId={taskId}
          autoApprove={autoApprove}
          resolvedFromStream={resolvedMsg != null}
        />
      );
    }
    if (text.startsWith(CLARIFICATION_RESOLVED_PREFIX)) return null;

    if (text.startsWith('## Swarm Factory Report')) return null;
    if (FOLLOWUP_RE.test(text)) return <FollowUpCard text={text} />;
    if (KICKOFF_RE.test(text)) return <KickoffCard text={text} />;
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

export function MessageFeed({
  messages,
  isRunning,
  taskId,
  autoApprove = false,
  taskStatus = 'RUNNING',
}: {
  messages: TaskMessage[];
  isRunning: boolean;
  taskId: string;
  autoApprove?: boolean;
  taskStatus?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const builderProgress = useMemo(() => computeBuilderProgress(messages), [messages]);

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
    <BuilderProgressCtx.Provider value={builderProgress}>
    <div>
      <style>{`@keyframes msgFadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }`}</style>
      {messages.map((msg) => (
        <div key={msg.id} style={{ animation: 'msgFadeIn 0.22s ease-out both' }}>
          <MessageRow message={msg} taskId={taskId} autoApprove={autoApprove} allMessages={messages} />
        </div>
      ))}
      {isRunning && (
        <ThinkingIndicator messages={messages} taskStatus={taskStatus} />
      )}
      {!isRunning && taskStatus !== 'COMPLETED' && taskStatus !== 'RUNNING' && (
        <WorkflowTerminalBanner status={taskStatus} />
      )}
      <div ref={bottomRef} />
    </div>
    </BuilderProgressCtx.Provider>
  );
}
