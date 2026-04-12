'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllReports, deleteReport, type SavedReport } from '@/lib/report-store';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ReportRow({ report, onDelete }: { report: SavedReport; onDelete: () => void }) {
  const [hovering, setHovering] = useState(false);
  const preview = report.answer
    .replace(/#+\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n/g, ' ')
    .slice(0, 120);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Link
        href={`/r/${report.taskId}`}
        style={{ textDecoration: 'none', display: 'block' }}
      >
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          background: hovering ? 'var(--surface-raised)' : 'var(--surface)',
          transition: 'background 0.12s ease',
          cursor: 'pointer',
          paddingRight: hovering ? '2.5rem' : '1rem',
        }}>
          <p style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: '0.25rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {report.query}
          </p>
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {preview}
          </p>
          <p style={{
            fontSize: '0.6875rem',
            color: 'var(--text-secondary)',
            marginTop: '0.375rem',
            opacity: 0.7,
          }}>
            {timeAgo(report.createdAt)}
          </p>
        </div>
      </Link>

      {/* Delete button — only on hover */}
      {hovering && (
        <button
          onClick={(e) => { e.preventDefault(); onDelete(); }}
          style={{
            position: 'absolute',
            top: '0.625rem',
            right: '0.625rem',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            lineHeight: 1,
            fontFamily: 'inherit',
          }}
          title="Remove from history"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function HistorySidebar() {
  const [reports, setReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    setReports(getAllReports());
  }, []);

  function handleDelete(taskId: string) {
    deleteReport(taskId);
    setReports(prev => prev.filter(r => r.taskId !== taskId));
  }

  if (reports.length === 0) return null;

  return (
    <div style={{ width: '100%', maxWidth: '680px' }}>
      <p style={{
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        marginBottom: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        Recent
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {reports.slice(0, 8).map(report => (
          <ReportRow
            key={report.taskId}
            report={report}
            onDelete={() => handleDelete(report.taskId)}
          />
        ))}
      </div>
    </div>
  );
}
