'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listProjects, type Project } from '@/lib/project-repository';
import { getReportsByProject, type SavedReport } from '@/lib/report-store';

const ACCENT = '#f97316';

// ── Status polling ────────────────────────────────────────────────────────────

type TaskStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | string;

type ProjectCard = {
  project: Project;
  reports: SavedReport[];
  activeCount: number;
  lastActivity: string | null;
  latestSummary: string | null;
  nextStep: string | null;
};

function extractNextStep(summary: string | null): string | null {
  if (!summary) return null;
  // Look for remaining QA issues or suggestions in the report
  const healMatch = summary.match(/Remaining QA Issues\n(- .+)/);
  if (healMatch) return healMatch[1].replace(/^- /, '');
  const secMatch = summary.match(/Security Findings.*\n(- .+)/);
  if (secMatch) return secMatch[1].replace(/^- \[.*?\] /, '');
  if (summary.includes('✓ Complete')) return 'Build complete — ready for follow-up.';
  if (summary.includes('⚠ Blocked')) return 'Resolve blocking issue before proceeding.';
  return null;
}

function statusColor(reports: SavedReport[], activeCount: number): string {
  if (activeCount > 0) return '#f97316';
  if (reports.length === 0) return 'var(--text-secondary)';
  const latest = reports[0];
  if (latest.summary?.includes('✓ Complete')) return '#22c55e';
  if (latest.summary?.includes('⚠ Blocked') || latest.summary?.includes('Failed')) return '#ef4444';
  return 'var(--text-secondary)';
}

function statusLabel(reports: SavedReport[], activeCount: number): string {
  if (activeCount > 0) return `${activeCount} agent${activeCount > 1 ? 's' : ''} building`;
  if (reports.length === 0) return 'No builds yet';
  const latest = reports[0];
  if (latest.summary?.includes('✓ Complete')) return 'Complete';
  if (latest.summary?.includes('⚠ Blocked')) return 'Blocked';
  return 'Idle';
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconFolder() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: color === ACCENT ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
    }} />
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ card, onClick }: { card: ProjectCard; onClick: () => void }) {
  const { project, reports, activeCount } = card;
  const color = statusColor(reports, activeCount);
  const label = statusLabel(reports, activeCount);
  const latestQuery = reports[0]?.query ?? null;
  const nextStep = card.nextStep;
  const lastDate = card.lastActivity ? new Date(card.lastActivity) : null;
  const relativeTime = lastDate ? formatRelative(lastDate) : null;

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '1.25rem',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        width: '100%',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT + '80';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${ACCENT}12`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ color: 'var(--text-secondary)', display: 'flex', opacity: 0.6 }}><IconFolder /></span>
          <div>
            <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
              {project.name}
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0', opacity: 0.6 }}>
              {project.slug}
            </p>
          </div>
        </div>
        <span style={{ color: 'var(--text-secondary)', display: 'flex', opacity: 0.4, flexShrink: 0, marginTop: '0.1rem' }}>
          <IconChevronRight />
        </span>
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <PulsingDot color={color} />
        <span style={{ fontSize: '0.78rem', color, fontWeight: 500 }}>{label}</span>
        {relativeTime && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto', opacity: 0.5 }}>
            {relativeTime}
          </span>
        )}
      </div>

      {/* Latest task */}
      {latestQuery && (
        <div style={{
          background: 'var(--surface-raised)',
          borderRadius: '8px',
          padding: '0.5rem 0.625rem',
        }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', margin: '0 0 0.2rem', opacity: 0.5 }}>
            Last build
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {latestQuery}
          </p>
        </div>
      )}

      {/* Crew recommendation */}
      {nextStep && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: ACCENT, flexShrink: 0, marginTop: '0.05rem' }}>
            Crew
          </span>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            {nextStep}
          </p>
        </div>
      )}

      {/* Build count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: 'auto' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.5 }}>
          {reports.length} build{reports.length !== 1 ? 's' : ''}
        </span>
        {activeCount > 0 && (
          <span style={{ fontSize: '0.72rem', color: ACCENT, fontWeight: 600 }}>
            {activeCount} active
          </span>
        )}
      </div>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '1rem', paddingTop: '6rem',
      color: 'var(--text-secondary)',
    }}>
      <div style={{ opacity: 0.2 }}><IconFolder /></div>
      <p style={{ fontSize: '0.9375rem', margin: 0 }}>No projects yet</p>
      <button
        onClick={onNew}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: ACCENT, border: 'none', borderRadius: '8px',
          padding: '0.5rem 1rem', color: 'white',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <IconPlus /> New project
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const projects = await listProjects();
        const built: ProjectCard[] = projects.map(project => {
          const reports = getReportsByProject(project.id);
          const activeCount = 0; // live status check deferred — polling below
          const lastActivity = reports[0]?.createdAt ?? project.created_at;
          const latestSummary = reports.find(r => r.summary)?.summary ?? null;
          const nextStep = extractNextStep(latestSummary);
          return { project, reports, activeCount, lastActivity, latestSummary, nextStep };
        });
        setCards(built);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '3rem 2.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Projects
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0', opacity: 0.6 }}>
            {cards.length} project{cards.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: ACCENT, border: 'none', borderRadius: '8px',
            padding: '0.5rem 1rem', color: 'white',
            fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <IconPlus /> New build
        </button>
      </div>

      {cards.length === 0 ? (
        <EmptyState onNew={() => router.push('/')} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem',
        }}>
          {cards.map(card => (
            <ProjectCard
              key={card.project.id}
              card={card}
              onClick={() => {
                // Navigate to latest task for this project, or home if none
                const latest = card.reports[0];
                if (latest) router.push(`/task/${latest.taskId}`);
                else router.push('/');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
