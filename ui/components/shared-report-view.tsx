'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getReport, type SavedReport } from '@/lib/report-store';
import { ResultPanel } from '@/components/result-panel';

export function SharedReportView({ taskId }: { taskId: string }) {
  const [report, setReport] = useState<SavedReport | null | 'loading'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setReport(getReport(taskId));
  }, [taskId]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (report === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
      }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Report not found
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 400 }}>
          This report was saved in someone else&apos;s browser. In a future version reports will be stored on a server and always accessible.
        </p>
        <Link href="/" style={{
          color: 'var(--accent)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
        }}>
          ← Run your own research
        </Link>
      </div>
    );
  }

  const date = new Date(report.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0.875rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Link href="/" style={{
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          flexShrink: 0,
        }}>
          ← Oumuamua
        </Link>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <p style={{
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {report.query}
          </p>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
          {date}
        </span>

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
      </header>

      {/* Report */}
      <div style={{
        flex: 1,
        maxWidth: '780px',
        margin: '0 auto',
        width: '100%',
        padding: '2rem 1.5rem',
      }}>
        <ResultPanel answer={report.answer} />

        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Researched by Oumuamua · {date}
          </p>
          <Link href="/" style={{
            fontSize: '0.8125rem',
            color: 'var(--accent)',
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            Run your own research →
          </Link>
        </div>
      </div>
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
