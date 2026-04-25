'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CHECKPOINT_LABELS, type ApprovalPayload, type ClarificationPayload,
} from './agent-utils';

export function ApprovalCard({
  payload,
  taskId,
  autoApprove,
  resolvedState = null,
}: {
  payload: ApprovalPayload;
  taskId: string;
  autoApprove: boolean;
  resolvedState?: 'approved' | 'rejected' | null;
}) {
  const [localDecided, setLocalDecided] = useState<'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(false);
  const ACCENT = '#f97316';

  const decided = resolvedState ?? localDecided;

  const sendSignal = useCallback(async (approved: boolean) => {
    if (decided || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: payload.workflow_id, approved }),
      });
      if (!res.ok) return;
      setLocalDecided(approved ? 'approved' : 'rejected');
    } catch {
      // leave in pending state so user can retry
    } finally {
      setLoading(false);
    }
  }, [decided, loading, taskId, payload.workflow_id]);

  useEffect(() => {
    if (autoApprove && !decided && !loading) {
      sendSignal(true);
    }
  }, [autoApprove, decided, loading, sendSignal]);

  const label = CHECKPOINT_LABELS[payload.checkpoint] ?? 'Approval Required';
  const borderColor = decided === 'approved' ? '#22c55e' : decided === 'rejected' ? '#ef4444' : ACCENT;

  return (
    <div style={{
      margin: '0.75rem 0',
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--surface)',
      opacity: decided ? 0.75 : 1,
      transition: 'opacity 0.2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 0.875rem',
        background: `${borderColor}12`,
        borderBottom: `1px solid ${borderColor}30`,
      }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: borderColor }}>
          {label}
        </span>
        {decided && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: decided === 'approved' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {decided === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </span>
        )}
      </div>

      <div style={{ padding: '0.75rem 0.875rem' }}>
        <p style={{ fontSize: '0.8375rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
          {payload.action}
        </p>
      </div>

      {!decided && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0 0.875rem 0.75rem' }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => sendSignal(true)}
            style={{
              flex: 1, padding: '0.45rem 0', borderRadius: '8px',
              background: '#22c55e', border: 'none', color: 'white',
              fontSize: '0.8125rem', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            {loading ? '…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => sendSignal(false)}
            style={{
              flex: 1, padding: '0.45rem 0', borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem', fontWeight: 400, cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function ClarificationCard({
  payload,
  taskId,
  autoApprove,
  resolvedFromStream = false,
}: {
  payload: ClarificationPayload;
  taskId: string;
  autoApprove: boolean;
  resolvedFromStream?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, boolean>>({});
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const ACCENT = '#f97316';

  const submitted = resolvedFromStream || localSubmitted;

  function parseOptions(question: string): string[] {
    const egMatch = question.match(/\(e\.g\.?\s+([^)]+)\)/i);
    if (egMatch) {
      return egMatch[1]
        .split(/,\s*/)
        .map(s => s.replace(/^(or\s+)/i, '').trim())
        .filter(Boolean)
        .slice(0, 8);
    }

    const lines = question.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      return lines.slice(1).map(l => l.replace(/^[-•*]\s*/, '')).filter(Boolean).slice(0, 8);
    }

    const q = question.toLowerCase();
    if (q.includes('framework') || q.includes('language') || q.includes('stack')) {
      return ['React + TypeScript', 'Next.js', 'Vue 3', 'Svelte', 'Python / FastAPI', 'Node.js / Express'];
    }
    if (q.includes('platform') || q.includes('web app') || q.includes('mobile') || q.includes('cli')) {
      return ['Web app', 'Mobile app', 'CLI tool', 'API only', 'Desktop app'];
    }
    if (q.includes('frontend') || q.includes('backend') || q.includes('full stack') || q.includes('fullstack')) {
      return ['Full stack (frontend + backend)', 'Frontend only', 'Backend API only', 'Frontend with mock data'];
    }
    if (q.includes('database') || q.includes('persist') || q.includes('storage') || q.includes('backend')) {
      return ['PostgreSQL', 'SQLite', 'MongoDB', 'MySQL', 'localStorage / in-memory', 'No database needed'];
    }
    if (q.includes('auth') || q.includes('login') || q.includes('user')) {
      return ['No auth needed', 'Email + password', 'OAuth (Google/GitHub)', 'JWT tokens', 'Single user local app'];
    }
    if (q.includes('ui') || q.includes('frontend') || q.includes('design') || q.includes('style')) {
      return ['Tailwind CSS', 'Material UI', 'Shadcn/ui', 'Chakra UI', 'Plain CSS', 'No UI framework'];
    }
    if (q.includes('deploy') || q.includes('hosting') || q.includes('cloud')) {
      return ['Vercel', 'AWS', 'Railway', 'Fly.io', 'Docker / self-hosted', 'No deployment needed'];
    }
    if (q.includes('test') || q.includes('testing')) {
      return ['Vitest', 'Jest', 'Playwright', 'Cypress', 'No tests needed'];
    }

    return [];
  }

  function stripHint(question: string): string {
    const firstLine = question.split('\n')[0];
    return firstLine.replace(/\s*\(e\.g\.?[^)]+\)/gi, '').trim();
  }

  const sendAnswers = useCallback(async (skip = false) => {
    if (submitted || loading) return;
    setLoading(true);
    try {
      const answerPayload = skip
        ? {}
        : Object.fromEntries(payload.questions.map(q => [q, answers[q] ?? '']));
      await fetch(`/api/tasks/${taskId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: payload.workflow_id,
          signal: 'submit',
          payload: answerPayload,
        }),
      });
      setLocalSubmitted(true);
    } catch {
      // leave open so user can retry
    } finally {
      setLoading(false);
    }
  }, [submitted, loading, taskId, payload, answers]);

  useEffect(() => {
    if (autoApprove && !submitted && !loading) sendAnswers(true);
  }, [autoApprove, submitted, loading, sendAnswers]);

  return (
    <div style={{
      margin: '0.75rem 0',
      border: `1px solid ${submitted ? 'var(--border)' : ACCENT}`,
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--surface)',
      opacity: submitted ? 0.8 : 1,
      transition: 'opacity 0.2s, border-color 0.2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 0.875rem',
        background: submitted ? 'transparent' : `${ACCENT}12`,
        borderBottom: `1px solid ${submitted ? 'var(--border)' : `${ACCENT}30`}`,
      }}>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: submitted ? 'var(--text-secondary)' : ACCENT,
        }}>
          Project Manager · Clarification
        </span>
        {submitted && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>
            ✓ Submitted
          </span>
        )}
      </div>

      {submitted && (
        <div style={{ padding: '0.625rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {Object.keys(answers).length > 0 ? (
            payload.questions.map((q, i) => {
              const answer = answers[q];
              return (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', opacity: 0.5, flexShrink: 0, minWidth: '1rem' }}>
                    {i + 1}.
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4, flex: 1 }}>
                    {stripHint(q)}
                  </span>
                  {answer && (
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)',
                      background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`,
                      borderRadius: '5px', padding: '0.05rem 0.4rem', flexShrink: 0,
                    }}>
                      {answer}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, opacity: 0.6 }}>
              {payload.questions.length} question{payload.questions.length !== 1 ? 's' : ''} answered — build is proceeding.
            </p>
          )}
        </div>
      )}

      {!submitted && (
        <>
          <div style={{ padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {payload.context && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, fontStyle: 'italic', opacity: 0.8 }}>
                {payload.context}
              </p>
            )}

            {payload.questions.map((q, i) => {
              const options = parseOptions(q);
              const label = stripHint(q);
              const selected = answers[q] ?? '';
              const isCustom = customInputs[q] ?? false;

              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
                    {i + 1}. {label}
                  </p>

                  {options.length > 0 && !isCustom ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {options.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswers(prev => ({ ...prev, [q]: opt }))}
                          style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            border: `1px solid ${selected === opt ? ACCENT : 'var(--border)'}`,
                            background: selected === opt ? `${ACCENT}18` : 'var(--surface-raised)',
                            color: selected === opt ? ACCENT : 'var(--text-secondary)',
                            fontSize: '0.78rem', fontWeight: selected === opt ? 600 : 400,
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'all 0.1s',
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomInputs(prev => ({ ...prev, [q]: true }));
                          setAnswers(prev => ({ ...prev, [q]: '' }));
                        }}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: '999px',
                          border: '1px dashed var(--border)',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                          opacity: 0.6,
                        }}
                      >
                        Other…
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        autoFocus={isCustom}
                        placeholder="Type your answer…"
                        value={selected}
                        onChange={e => setAnswers(prev => ({ ...prev, [q]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') sendAnswers(false); }}
                        style={{
                          flex: 1, padding: '0.4rem 0.625rem',
                          background: 'var(--surface-raised)',
                          border: '1px solid var(--border)',
                          borderRadius: '7px',
                          color: 'var(--text-primary)',
                          fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      {options.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomInputs(prev => ({ ...prev, [q]: false }));
                            setAnswers(prev => ({ ...prev, [q]: '' }));
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.6,
                            fontFamily: 'inherit', padding: '0.2rem 0.3rem',
                          }}
                        >
                          ← chips
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', padding: '0 0.875rem 0.75rem' }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => sendAnswers(false)}
              style={{
                flex: 2, padding: '0.45rem 0', borderRadius: '8px',
                background: ACCENT, border: 'none', color: 'white',
                fontSize: '0.8125rem', fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.12s',
              }}
            >
              {loading ? '…' : 'Submit answers'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => sendAnswers(true)}
              style={{
                flex: 1, padding: '0.45rem 0', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: '0.8125rem',
                cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
