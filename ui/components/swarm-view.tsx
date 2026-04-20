'use client';

import { useState, useRef, useEffect } from 'react';
import { useTask } from '@/hooks/use-task';
import { useTaskMessages } from '@/hooks/use-task-messages';
import { useSendFollowUp } from '@/hooks/use-send-followup';
import { MessageFeed } from '@/components/message-feed';
import { ChibiAvatar, type SwarmRole } from '@/components/chibi-avatar';
import { FileExplorer } from '@/components/file-explorer';
import { useAgentConfigStore } from '@/lib/agent-config-store';
import { useFileAttachments, buildAttachmentBlock } from '@/hooks/use-file-attachments';
import type { Task } from 'agentex/resources';
import type { TaskMessage } from 'agentex/resources';

const STATUS_LABEL: Record<string, string> = {
  RUNNING: 'Running',
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

type StageState = 'pending' | 'active' | 'done' | 'failed';

interface PipelineStage {
  key: string;
  label: string;
  state: StageState;
  subtracks?: string[]; // parallel builder tracks
}

function getTaskGoal(task: Task | undefined): string {
  if (!task) return '';
  const params = task.params as Record<string, unknown> | null | undefined;
  return (params?.prompt as string) ?? (params?.query as string) ?? '';
}

function getRepoPath(task: Task | undefined): string {
  const params = task?.params as Record<string, unknown> | null | undefined;
  return (params?.repo_path as string) ?? '';
}

const WRITE_FILE_RE = /^\[Builder[^\]]*\] (?:write_file|patch_file):\s*(.+?)\s*$/;

function extractWrittenPaths(messages: TaskMessage[]): string[] {
  const paths: string[] = [];
  for (const msg of messages ?? []) {
    const c = msg.content as { type?: string; content?: unknown } | null | undefined;
    const text = (c?.type === 'text' || !c?.type) && typeof c?.content === 'string' ? c.content : '';
    const m = text.match(WRITE_FILE_RE);
    if (m) paths.push(m[1].trim());
  }
  return paths;
}

function getTextContent(msg: { content: unknown }): string | null {
  const c = msg.content as { type?: string; content?: unknown } | null | undefined;
  if (!c) return null;
  if ((c.type === 'text' || !c.type) && typeof c.content === 'string') return c.content;
  return null;
}

// Foreman dispatch tags that mark stage transitions
const STAGE_SIGNALS: { stage: string; pattern: RegExp }[] = [
  { stage: 'architect',  pattern: /\[Foreman\] Dispatching Architect/ },
  { stage: 'builder',    pattern: /\[Foreman\] (?:Dispatching Builder|Launching \d+ parallel builder)/ },
  { stage: 'inspector',  pattern: /\[Foreman\] Dispatching Inspector/ },
  { stage: 'security',   pattern: /\[Foreman\] Dispatching Security/ },
  { stage: 'devops',     pattern: /\[Foreman\] Dispatching DevOps/ },
];

// Detect parallel track labels from "[Foreman] Launching N parallel builders (…): frontend + backend + tests"
const PARALLEL_LAUNCH_RE = /\[Foreman\] Launching \d+ parallel builders[^:]*:\s*(.+)/;

interface ParsedPipeline {
  stages: PipelineStage[];
  finalReport: string | null;
  prUrl: string | null;
}

function parsePipeline(
  messages: { content: unknown }[] | undefined,
  isDone: boolean,
  isFailed: boolean,
): ParsedPipeline {
  const STAGE_KEYS = ['architect', 'builder', 'inspector', 'security', 'devops'];

  let activeStage: string | null = null;
  let parallelTracks: string[] = [];
  let finalReport: string | null = null;
  const reachedStages = new Set<string>();

  for (const msg of messages ?? []) {
    const text = getTextContent(msg);
    if (!text) continue;

    for (const { stage, pattern } of STAGE_SIGNALS) {
      if (pattern.test(text)) {
        reachedStages.add(stage);
        activeStage = stage;
      }
    }

    const pm = text.match(PARALLEL_LAUNCH_RE);
    if (pm) {
      parallelTracks = pm[1].split(/\s*\+\s*|\s*,\s*/).map(s => s.trim()).filter(Boolean);
    }

    if (text.includes('## Swarm Factory Report')) {
      finalReport = text;
      const urlMatch = text.match(/PR opened → (https?:\/\/\S+)/);
      // prUrl extracted below
    }
  }

  const prUrl = finalReport ? (finalReport.match(/PR opened → (https?:\/\/\S+)/)?.[1] ?? null) : null;

  const activeIdx = activeStage ? STAGE_KEYS.indexOf(activeStage) : -1;

  const stages: PipelineStage[] = STAGE_KEYS.map((key, i) => {
    const isActive = key === activeStage && !isDone && !isFailed;
    const isPast = isDone
      ? reachedStages.has(key)
      : (activeIdx >= 0 && i < activeIdx);
    const isFuture = !isActive && !isPast;

    let state: StageState = 'pending';
    if (isActive) state = 'active';
    else if (isPast && !isFailed) state = 'done';
    else if (isFailed && key === activeStage) state = 'failed';

    const label = key === 'builder' && parallelTracks.length > 1
      ? `Builder ×${parallelTracks.length}`
      : key.charAt(0).toUpperCase() + key.slice(1);

    return {
      key,
      label,
      state,
      subtracks: key === 'builder' && parallelTracks.length > 1 ? parallelTracks : undefined,
    };
  });

  return { stages, finalReport, prUrl };
}

// ── Preview pane ──────────────────────────────────────────────────────────────

function PreviewPane({
  url,
  manualUrl,
  onUrlChange,
}: {
  url: string;
  manualUrl: string;
  onUrlChange: (v: string) => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Address bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.375rem 0.625rem', borderBottom: '1px solid var(--border)',
        background: 'var(--background)', flexShrink: 0,
      }}>
        <input
          value={manualUrl}
          onChange={e => onUrlChange(e.target.value)}
          placeholder={url ? url : 'http://localhost:3000'}
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '5px', padding: '0.25rem 0.5rem',
            fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'monospace',
            outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          onKeyDown={e => { if (e.key === 'Enter') setReloadKey(k => k + 1); }}
        />
        <button
          onClick={() => setReloadKey(k => k + 1)}
          title="Reload"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '0.2rem 0.3rem',
            borderRadius: '4px', lineHeight: 1,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          ↺
        </button>
      </div>

      {/* iframe or empty state */}
      {url ? (
        <iframe
          key={reloadKey}
          src={url}
          style={{ flex: 1, border: 'none', background: '#fff' }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          color: 'var(--text-secondary)',
        }}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.25} strokeLinecap="round" style={{ opacity: 0.25 }}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p style={{ fontSize: '0.8rem', opacity: 0.4 }}>No preview URL yet</p>
          <p style={{ fontSize: '0.72rem', opacity: 0.3 }}>
            Enter a URL above or wait for the builder to start a dev server
          </p>
        </div>
      )}
    </div>
  );
}

export function SwarmView({ taskId }: { taskId: string }) {
  const { data: task, isLoading: taskLoading } = useTask(taskId);
  const { data: messages, isLoading: msgsLoading } = useTaskMessages(taskId);
  const configRepoPath = useAgentConfigStore(s => s.config.swarmRepoPat);
  const [followUp, setFollowUp] = useState('');
  const [centerTab, setCenterTab] = useState<'explorer' | 'preview'>('explorer');
  const [previewUrl, setPreviewUrl] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followUpFileInputRef = useRef<HTMLInputElement>(null);
  const sendFollowUp = useSendFollowUp(taskId);
  const { files: followUpFiles, error: followUpFileError, addFiles: addFollowUpFiles, removeFile: removeFollowUpFile, clearAll: clearFollowUpFiles } = useFileAttachments();

  const status = task?.status ?? 'RUNNING';
  const isDone = status === 'COMPLETED' || status === 'FAILED';
  const isFailed = status === 'FAILED';
  const goal = getTaskGoal(task);
  const repoPath = getRepoPath(task) || configRepoPath || '';
  const writtenPaths = extractWrittenPaths(messages ?? []);
  const { stages, finalReport, prUrl } = parsePipeline(messages, isDone, isFailed);
  const effectivelyDone = isDone || !!finalReport;

  // Auto-detect dev server URL from messages
  const detectedUrl = (() => {
    const DEV_URL_RE = /https?:\/\/localhost:\d+/;
    for (let i = (messages ?? []).length - 1; i >= 0; i--) {
      const text = getTextContent((messages ?? [])[i]);
      const m = text?.match(DEV_URL_RE);
      if (m) return m[0];
    }
    return null;
  })();

  const activePreviewUrl = manualUrl.trim() || detectedUrl || '';

  const submitFollowUp = () => {
    const text = followUp.trim();
    if (!text || sendFollowUp.isPending) return;
    const attachmentBlock = buildAttachmentBlock(followUpFiles);
    const fullText = text + attachmentBlock;
    sendFollowUp.mutate(fullText, { onSuccess: () => { setFollowUp(''); clearFollowUpFiles(); } });
  };

  if (taskLoading && !task) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
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
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <p style={{
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {goal || taskId}
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Body — 3 columns: log | IDE | pipeline */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '260px 1fr 272px',
        width: '100%',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left: activity log + follow-up input */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '1.25rem 1rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            <h2 style={{
              fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.875rem', opacity: 0.6,
            }}>
              {effectivelyDone ? 'Build Log' : 'Live Activity'}
            </h2>
            {msgsLoading && !messages ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '2rem' }}>
                <Spinner />
              </div>
            ) : (
              <MessageFeed messages={messages ?? []} isRunning={!effectivelyDone} />
            )}
          </div>

          {/* Follow-up input */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '0.625rem 0.75rem',
            flexShrink: 0,
            background: 'var(--background)',
          }}>
            {/* Hidden file input */}
            <input
              ref={followUpFileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files) { addFollowUpFiles(e.target.files); e.target.value = ''; } }}
            />

            {/* File chips */}
            {followUpFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.4rem' }}>
                {followUpFiles.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                    background: 'var(--surface-raised)', border: '1px solid var(--border)',
                    borderRadius: '5px', padding: '0.15rem 0.4rem',
                    fontSize: '0.68rem', color: 'var(--text-secondary)',
                    maxWidth: '160px',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFollowUpFile(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', lineHeight: 1, fontSize: '0.7rem' }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitFollowUp(); }
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) addFollowUpFiles(e.dataTransfer.files); }}
              placeholder={effectivelyDone ? 'Send a follow-up to the foreman…' : 'Foreman is building — queue a follow-up…'}
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '0.5rem 0.625rem',
                fontSize: '0.78rem', color: 'var(--text-primary)',
                fontFamily: 'inherit', resize: 'none', outline: 'none',
                lineHeight: '1.4',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.375rem', gap: '0.375rem', alignItems: 'center' }}>
              {(sendFollowUp.isError || followUpFileError) && (
                <span style={{ fontSize: '0.68rem', color: 'var(--error)', flex: 1 }}>
                  {followUpFileError || 'Failed to send'}
                </span>
              )}
              {sendFollowUp.isSuccess && (
                <span style={{ fontSize: '0.68rem', color: 'var(--success)', flex: 1 }}>Sent ✓</span>
              )}
              {/* Paperclip */}
              <button
                type="button"
                onClick={() => followUpFileInputRef.current?.click()}
                title="Attach files"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem',
                  color: followUpFiles.length ? 'var(--accent)' : 'var(--text-secondary)',
                  display: 'flex', opacity: 0.7,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <button
                onClick={submitFollowUp}
                disabled={!followUp.trim() || sendFollowUp.isPending}
                style={{
                  padding: '0.3rem 0.75rem', borderRadius: '5px', border: 'none',
                  background: followUp.trim() ? 'var(--accent)' : 'var(--surface-raised)',
                  color: followUp.trim() ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.75rem', fontWeight: 600, cursor: followUp.trim() ? 'pointer' : 'default',
                  opacity: sendFollowUp.isPending ? 0.6 : 1,
                  transition: 'background 0.15s',
                }}
              >
                {sendFollowUp.isPending ? 'Sending…' : 'Send ↵'}
              </button>
            </div>
          </div>
        </div>

        {/* Center: Explorer / Preview tabs */}
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'stretch', flexShrink: 0,
            borderBottom: '1px solid var(--border)', background: 'var(--background)',
          }}>
            {(['explorer', 'preview'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setCenterTab(tab)}
                style={{
                  padding: '0 1.125rem', height: '36px', border: 'none', cursor: 'pointer',
                  background: 'transparent', fontFamily: 'inherit',
                  fontSize: '0.75rem', fontWeight: centerTab === tab ? 600 : 400,
                  color: centerTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom: centerTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'color 0.1s',
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'preview' && activePreviewUrl && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--success)', flexShrink: 0,
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {centerTab === 'explorer' ? (
              <FileExplorer
                repoRoot={repoPath}
                writtenPaths={writtenPaths}
                isRunning={!effectivelyDone}
              />
            ) : (
              <PreviewPane url={activePreviewUrl} onUrlChange={setManualUrl} manualUrl={manualUrl} />
            )}
          </div>
        </div>

        {/* Right: pipeline + report */}
        <div style={{
          padding: '1.25rem 1rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}>
          <div>
            <h2 style={{
              fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.875rem', opacity: 0.6,
            }}>
              Pipeline
            </h2>
            <PipelineTracker stages={stages} />
          </div>

          {prUrl && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.875rem',
              background: 'color-mix(in srgb, var(--success) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
              borderRadius: '8px', color: 'var(--success)',
              fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none',
            }}>
              🚀 Pull Request →
            </a>
          )}

          {finalReport && (
            <div>
              <h2 style={{
                fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.875rem', opacity: 0.6,
              }}>
                Report
              </h2>
              <ReportCard report={finalReport} />
            </div>
          )}

          {effectivelyDone && !finalReport && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {isFailed ? 'Build failed — check the log for details.' : 'Build complete.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PipelineTracker({ stages }: { stages: PipelineStage[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {stages.map((stage) => {
        const isActive = stage.state === 'active';
        const isDone = stage.state === 'done';
        const isPending = stage.state === 'pending';

        let borderColor = 'var(--border)';
        let bg = 'var(--surface-raised)';
        let labelColor = 'var(--text-secondary)';
        const opacity = isPending ? 0.4 : 1;

        if (isActive) {
          borderColor = 'var(--accent)';
          bg = 'color-mix(in srgb, var(--accent) 8%, transparent)';
          labelColor = 'var(--accent)';
        } else if (isDone) {
          borderColor = 'color-mix(in srgb, var(--success) 30%, transparent)';
          labelColor = 'var(--success)';
        } else if (stage.state === 'failed') {
          borderColor = 'color-mix(in srgb, var(--error) 30%, transparent)';
          labelColor = 'var(--error)';
        }

        return (
          <div key={stage.key}>
            {/* Main stage row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              background: bg,
              border: `1px solid ${borderColor}`,
              borderRadius: stage.subtracks ? '10px 10px 0 0' : '10px',
              opacity,
              transition: 'all 0.2s ease',
            }}>
              <ChibiAvatar role={stage.key as SwarmRole} size={28} />
              <span style={{ fontSize: '0.875rem', fontWeight: isActive ? 600 : 500, color: labelColor, flex: 1 }}>
                {stage.label}
              </span>
              {isActive && (
                <PulsingDot />
              )}
              {isDone && (
                <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>✓</span>
              )}
              {stage.state === 'failed' && (
                <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>✗</span>
              )}
            </div>

            {/* Parallel subtracks */}
            {stage.subtracks && (
              <div style={{
                border: `1px solid ${borderColor}`,
                borderTop: 'none',
                borderRadius: '0 0 10px 10px',
                overflow: 'hidden',
                opacity,
              }}>
                {stage.subtracks.map((track, i) => (
                  <div
                    key={track}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      padding: '0.4rem 0.875rem 0.4rem 2rem',
                      background: 'var(--surface)',
                      borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.5 }}>⤷</span>
                    <span style={{ fontSize: '0.8rem', color: labelColor, fontFamily: 'monospace' }}>{track}</span>
                    {isActive && <PulsingDot />}
                    {isDone && <span style={{ color: 'var(--success)', fontSize: '0.75rem', marginLeft: 'auto' }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReportCard({ report }: { report: string }) {
  return (
    <div style={{
      padding: '1.25rem',
      background: 'var(--surface-raised)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
    }}>
      <pre style={{
        fontFamily: 'inherit',
        fontSize: '0.8125rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        margin: 0,
      }}>
        {report}
      </pre>
    </div>
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
          width: 8, height: 8, borderRadius: '50%',
          background: color, display: 'inline-block',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      )}
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

function PulsingDot() {
  return (
    <>
      <style>{`@keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: 'var(--accent)', display: 'inline-block',
        animation: 'pulseDot 1.2s ease-in-out infinite',
        flexShrink: 0,
      }} />
    </>
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
