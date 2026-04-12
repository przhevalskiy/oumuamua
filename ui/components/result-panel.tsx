'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ResultPanel({ answer }: { answer: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      padding: '1.5rem',
    }}>
      <style>{`
        .result-md h2 {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 1.5rem 0 0.625rem;
          padding-bottom: 0.375rem;
          border-bottom: 1px solid var(--border);
          letter-spacing: -0.01em;
        }
        .result-md h2:first-child {
          margin-top: 0;
        }
        .result-md p {
          font-size: 0.9375rem;
          color: var(--text-secondary);
          line-height: 1.75;
          margin-bottom: 0.75rem;
        }
        .result-md ul, .result-md ol {
          padding-left: 1.25rem;
          margin-bottom: 0.75rem;
        }
        .result-md li {
          font-size: 0.9375rem;
          color: var(--text-secondary);
          line-height: 1.75;
          margin-bottom: 0.375rem;
        }
        .result-md a {
          color: var(--accent);
          text-decoration: none;
          word-break: break-all;
        }
        .result-md a:hover {
          text-decoration: underline;
          color: var(--accent-hover);
        }
        .result-md strong {
          color: var(--text-primary);
          font-weight: 600;
        }
        .result-md code {
          background: var(--surface-raised);
          border-radius: 4px;
          padding: 0.1em 0.35em;
          font-size: 0.875em;
          color: var(--accent-hover);
        }
        .result-md blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: var(--text-secondary);
        }
        .result-md hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1rem 0;
        }
      `}</style>
      <div className="result-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {answer}
        </ReactMarkdown>
      </div>
    </div>
  );
}
