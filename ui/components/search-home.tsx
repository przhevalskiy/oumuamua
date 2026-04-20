'use client';

import { useState, useRef, type KeyboardEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateTask } from '@/hooks/use-create-task';
import { useAgentConfigStore } from '@/lib/agent-config-store';
import { saveReport } from '@/lib/report-store';
import { useFileAttachments, buildAttachmentBlock } from '@/hooks/use-file-attachments';

const SWARM_SUGGESTIONS = [
  'Add input validation to all API endpoints',
  'Write unit tests for the auth module',
  'Refactor the database layer to use async/await',
  'Add rate limiting middleware',
  'Fix all TypeScript type errors',
  'Add OpenAPI documentation to all routes',
  'Set up CI/CD pipeline with GitHub Actions',
  'Migrate from REST to GraphQL',
];

type TierKey = 'auto' | 'lightweight' | 'standard' | 'full';

const TIER_OPTIONS: { key: TierKey; label: string; value: number | undefined; desc: string }[] = [
  { key: 'auto',        label: 'Auto',        value: undefined, desc: 'Auto-detect from goal' },
  { key: 'lightweight', label: 'Lightweight',  value: 1,         desc: '1 track · 1 heal · no security' },
  { key: 'standard',    label: 'Standard',     value: 2,         desc: '2 tracks · 2 heals · full scan' },
  { key: 'full',        label: 'Full Crew',    value: 3,         desc: '4 tracks · max heals · enterprise' },
];

export function SearchHome() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tierKey, setTierKey] = useState<TierKey>('auto');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: createTask, isPending } = useCreateTask();
  const swarmConfig = useAgentConfigStore(s => s.config);
  const { files: attachedFiles, error: attachError, addFiles, removeFile, clearAll: clearFiles } = useFileAttachments();

  function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setError('');
    const attachmentBlock = buildAttachmentBlock(attachedFiles);
    const fullQuery = trimmed + attachmentBlock;

    const tierOption = TIER_OPTIONS.find(t => t.key === tierKey);
    const extraTier = tierOption?.value !== undefined ? { tier: tierOption.value } : {};

    createTask({
      query: fullQuery,
      extraParams: {
        repo_path: swarmConfig.swarmRepoPat || '.',
        branch_prefix: swarmConfig.swarmBranchPrefix || 'swarm',
        max_heal_cycles: swarmConfig.swarmMaxHealCycles,
        ...extraTier,
      },
    }, {
      onSuccess: (task) => {
        saveReport({ taskId: task.id, query: trimmed, answer: '', createdAt: new Date().toISOString() });
        clearFiles();
        router.push(`/task/${task.id}`);
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : 'Failed to start. Is the agent running?'),
    });
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSubmit(query);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(query);
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave() { setIsDragging(false); }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  const canSubmit = !isPending && !!query.trim();
  const ACCENT = '#f97316';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      gap: '2.5rem',
      backgroundImage: 'radial-gradient(circle, #d8d8d8 1px, transparent 1px)',
      backgroundSize: '48px 48px',
    }}>
      {/* Logo + tagline */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', borderRadius: '8px', lineHeight: 0 }}>
          <style>{`
            @keyframes logo-sheen {
              0%        { transform: translateX(-150%) skewX(-20deg); }
              16%       { transform: translateX(350%) skewX(-20deg); }
              16.0001%, 100% { transform: translateX(-150%) skewX(-20deg); }
            }
            .logo-sheen-overlay {
              position: absolute;
              inset: 0;
              pointer-events: none;
              overflow: hidden;
            }
            .logo-sheen-overlay::after {
              content: '';
              position: absolute;
              top: 0; left: 0;
              width: 35%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
              animation: logo-sheen 6s ease-in-out infinite;
            }
          `}</style>
          <img
            src="/Keystone.png"
            alt="Keystone"
            style={{ height: '64px', width: 'auto', objectFit: 'contain', display: 'block', marginBottom: '1rem' }}
          />
          <div className="logo-sheen-overlay" />
        </div>
        <p style={{
          fontSize: '1.33rem',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          letterSpacing: '0.01em',
        }}>
          Your durable engineering crew
        </p>
      </div>

      {/* Input */}
      <div
        style={{ width: '100%', maxWidth: '680px' }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <form onSubmit={onFormSubmit}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
          />

          <div style={{
            background: 'var(--surface)',
            border: `1px solid ${isDragging ? ACCENT : focused ? ACCENT : error ? 'var(--error)' : 'var(--border)'}`,
            borderRadius: attachedFiles.length ? '14px' : '999px',
            padding: attachedFiles.length ? '0.5rem 1rem' : '0 1rem',
            display: 'flex',
            flexDirection: attachedFiles.length ? 'column' : 'row',
            alignItems: attachedFiles.length ? 'stretch' : 'center',
            gap: '0.5rem',
            minHeight: '54px',
            transition: 'border-color 0.15s ease, border-radius 0.15s ease',
            outline: isDragging ? `2px dashed ${ACCENT}` : 'none',
            outlineOffset: '2px',
          }}>
            {/* File chips */}
            {attachedFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', paddingTop: '0.25rem' }}>
                {attachedFiles.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: 'var(--surface-raised)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '0.2rem 0.5rem',
                    fontSize: '0.72rem', color: 'var(--text-secondary)',
                    maxWidth: '200px',
                  }}>
                    <IconFile />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ opacity: 0.5, fontSize: '0.65rem', flexShrink: 0 }}>
                      {f.size > 1000 ? `${(f.size / 1000).toFixed(0)}k` : `${f.size}b`}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', display: 'flex', lineHeight: 1 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
              <span style={{ flexShrink: 0, display: 'flex', color: 'var(--text-secondary)', opacity: 0.5 }}>
                <IconWrench />
              </span>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={isDragging ? 'Drop files here…' : 'Describe what to build, fix, or refactor...'}
                disabled={isPending}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.9375rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  minWidth: 0,
                }}
              />

              {/* Paperclip */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                title="Attach files"
                style={{
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: attachedFiles.length ? ACCENT : 'var(--text-secondary)',
                  opacity: isPending ? 0.4 : 0.7,
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = isPending ? '0.4' : '0.7'; }}
              >
                <IconPaperclip />
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  flexShrink: 0,
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: canSubmit ? ACCENT : 'var(--surface-raised)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s ease',
                  color: canSubmit ? 'white' : 'var(--text-secondary)',
                }}
              >
                {isPending ? <SpinnerIcon size={15} /> : <IconArrowUp />}
              </button>
            </div>
          </div>

          {(error || attachError) && (
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '0.375rem', paddingLeft: '1.25rem' }}>
              {error || attachError}
            </p>
          )}
        </form>

        {/* Tier selector */}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.375rem', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Crew size:</span>
          {TIER_OPTIONS.map(opt => {
            const active = tierKey === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setTierKey(opt.key)}
                disabled={isPending}
                title={opt.desc}
                style={{
                  background: active ? ACCENT : 'transparent',
                  border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
                  borderRadius: '999px',
                  padding: '0.25rem 0.75rem',
                  color: active ? 'white' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.12s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Suggestions */}
        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
          {SWARM_SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => { setQuery(s); inputRef.current?.focus(); }}
              disabled={isPending}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '0.375rem 0.875rem',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT;
                (e.currentTarget as HTMLButtonElement).style.color = ACCENT;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconPaperclip() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  );
}

function IconFile() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function IconWrench() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
  );
}

function SpinnerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
