'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateTask } from '@/hooks/use-create-task';


export function SearchHome() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate: createTask, isPending } = useCreateTask();

  function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setError('');
    createTask(trimmed, {
      onSuccess: (task) => router.push(`/research/${task.id}`),
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
            src="/logo.png"
            alt="Oumuamua"
            style={{ height: '96px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
          <div className="logo-sheen-overlay" />
        </div>
        <p style={{
          fontSize: '1.33rem',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          letterSpacing: '0.01em',
        }}>
          Search intelligence for all web
        </p>
      </div>

      {/* Input */}
      <div style={{ width: '100%', maxWidth: '680px' }}>
        <form onSubmit={onFormSubmit}>
          {/* Pill input */}
          <div style={{
            background: 'var(--surface)',
            border: `1px solid ${focused ? 'var(--accent)' : error ? 'var(--error)' : 'var(--border)'}`,
            borderRadius: '999px',
            padding: '0 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            height: '54px',
            transition: 'border-color 0.15s ease',
          }}>
            {/* Left icon — paperclip */}
            <span style={{ flexShrink: 0, display: 'flex', color: 'var(--text-secondary)', opacity: 0.5 }}>
              <IconPaperclip />
            </span>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Ask anything..."
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

            {/* Right: send button */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: canSubmit ? 'var(--accent)' : 'var(--surface-raised)',
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
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '0.625rem', paddingLeft: '1.25rem' }}>
              {error}
            </p>
          )}
        </form>

        {/* Vertical pill dropdowns */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', position: 'relative' }}>
          <PillDropdowns
            verticals={SUGGESTED_VERTICALS}
            onSelect={q => { setQuery(q); inputRef.current?.focus(); }}
            disabled={isPending}
          />
        </div>
      </div>
    </div>
  );
}

const SUGGESTED_VERTICALS = [
  {
    label: 'Technology & AI',
    questions: [
      'How do large language models handle long-context reasoning?',
      'What are the latest breakthroughs in multimodal AI?',
      'Compare vector databases for production RAG systems',
      'What is the state of open-source LLMs in 2025?',
    ],
  },
  {
    label: 'Science',
    questions: [
      'Latest developments in quantum computing hardware',
      'How is CRISPR being used in clinical trials today?',
      'What are the most promising fusion energy projects?',
      'Recent findings in longevity and aging research',
    ],
  },
  {
    label: 'Business',
    questions: [
      'How are companies adopting AI agents in enterprise workflows?',
      'What sectors are seeing the most VC investment in 2025?',
      'Impact of interest rates on startup funding rounds',
      'Competitive landscape of cloud infrastructure providers',
    ],
  },
  {
    label: 'Policy',
    questions: [
      'How are governments regulating AI development globally?',
      'What is the current state of data privacy legislation?',
      'Economic impact of automation on labor markets',
      'How is climate policy evolving across major economies?',
    ],
  },
  {
    label: 'Health & Medicine',
    questions: [
      'What are the latest advances in cancer immunotherapy?',
      'How is AI being used in drug discovery?',
      'Current state of mRNA vaccine research beyond COVID',
      'What does the research say about GLP-1 drugs long-term?',
    ],
  },
  {
    label: 'Finance',
    questions: [
      'How are central banks approaching digital currencies?',
      'What is driving the 2025 private credit boom?',
      'How is AI changing quantitative trading strategies?',
      'State of the IPO market in 2025',
    ],
  },
  {
    label: 'Energy',
    questions: [
      'How fast is grid-scale battery storage scaling?',
      'What is the current state of small modular reactors?',
      'Which countries are leading in offshore wind deployment?',
      'How is hydrogen energy progressing commercially?',
    ],
  },
  {
    label: 'Geopolitics',
    questions: [
      'How is the US-China tech rivalry reshaping supply chains?',
      'What is the current state of NATO expansion?',
      'How are BRICS nations coordinating economically?',
      'Key flashpoints in global trade disputes in 2025',
    ],
  },
  {
    label: 'Space',
    questions: [
      'What is the current status of Artemis moon missions?',
      'How is SpaceX Starship changing launch economics?',
      'Latest findings from Mars exploration missions',
      'Who are the key players in the commercial space race?',
    ],
  },
  {
    label: 'Education',
    questions: [
      'How are universities adapting to AI in the classroom?',
      'What does research say about online learning outcomes?',
      'How is coding education evolving with AI tools?',
      'State of student debt and higher education reform',
    ],
  },
];

function PillDropdowns({
  verticals,
  onSelect,
  disabled,
}: {
  verticals: typeof SUGGESTED_VERTICALS;
  onSelect: (q: string) => void;
  disabled: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', width: '100%' }}>
      {verticals.map((vertical, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={vertical.label} style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              style={{
                background: isOpen ? 'var(--surface-raised)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '0.375rem 0.875rem',
                color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
              onMouseEnter={e => {
                if (!isOpen) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-secondary)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isOpen) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }
              }}
            >
              {vertical.label}
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.15s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity: 0.6 }}>
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {isOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '0.375rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.125rem',
                zIndex: 20,
                minWidth: '260px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}>
                {vertical.questions.map(q => (
                  <button
                    key={q}
                    onClick={() => { onSelect(q); setOpenIndex(null); }}
                    disabled={disabled}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      textAlign: 'left',
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.1s ease, color 0.1s ease',
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconPaperclip() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v8M8 12h8"/>
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
