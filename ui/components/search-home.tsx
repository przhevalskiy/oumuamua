'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateTask } from '@/hooks/use-create-task';
import { useAgentConfigStore } from '@/lib/agent-config-store';
import { saveReport } from '@/lib/report-store';

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

export function SearchHome() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate: createTask, isPending } = useCreateTask();
  const swarmConfig = useAgentConfigStore(s => s.config);

  function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setError('');

    createTask({
      query: trimmed,
      extraParams: {
        repo_path: swarmConfig.swarmRepoPat || '.',
        branch_prefix: swarmConfig.swarmBranchPrefix || 'swarm',
        max_heal_cycles: swarmConfig.swarmMaxHealCycles,
      },
    }, {
      onSuccess: (task) => {
        saveReport({ taskId: task.id, query: trimmed, answer: '', createdAt: new Date().toISOString() });
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
      <div style={{ width: '100%', maxWidth: '680px' }}>
        <form onSubmit={onFormSubmit}>
          <div style={{
            background: 'var(--surface)',
            border: `1px solid ${focused ? ACCENT : error ? 'var(--error)' : 'var(--border)'}`,
            borderRadius: '999px',
            padding: '0 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            height: '54px',
            transition: 'border-color 0.15s ease',
          }}>
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
              placeholder="Describe what to build, fix, or refactor..."
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
          
          {error && (
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '0.375rem', paddingLeft: '1.25rem' }}>
              {error}
            </p>
          )}
        </form>

        {/* Suggestions */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
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
