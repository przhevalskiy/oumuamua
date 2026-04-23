'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { listProjects, deleteProject, type Project } from '@/lib/project-repository';
import { getReportsByProject, deleteReportsByProject, type SavedReport } from '@/lib/report-store';
import { useTaskStatuses } from '@/hooks/use-task-statuses';
import { useProjectStore } from '@/lib/project-store';

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
  const healMatch = summary.match(/Remaining QA Issues\n(- .+)/);
  if (healMatch) return healMatch[1].replace(/^- /, '');
  const secMatch = summary.match(/Security Findings.*\n(- .+)/);
  if (secMatch) return secMatch[1].replace(/^- \[.*?\] /, '');
  if (summary.includes('✓ Complete')) return 'Build complete — ready for follow-up.';
  if (summary.includes('⚠ Blocked')) return 'Resolve blocking issue before proceeding.';
  return null;
}

// Derive status from live Agentex data + local report store messages
function resolveStatus(
  reports: SavedReport[],
  liveStatuses: Map<string, string>,
): { label: string; color: string; pulsing: boolean } {
  // Find all currently RUNNING tasks for this project
  const runningReports = reports.filter(r => liveStatuses.get(r.taskId) === 'RUNNING');

  if (runningReports.length > 0) {
    // Check the latest message content stored in the report for HITL/wait signals
    const latestRunning = runningReports[0];
    const content = latestRunning.lastMessageContent ?? '';

    // PM clarification — asking questions before planning
    if (content.includes('__clarification_request__')) {
      return { label: 'Needs your input', color: '#8b5cf6', pulsing: true };
    }
    // Architect plan review
    if (content.includes('"checkpoint":"architect_plan"') || content.includes('"checkpoint": "architect_plan"')) {
      return { label: 'Plan review needed', color: '#3b82f6', pulsing: true };
    }
    // Heal exhaustion — proceed or abort
    if (content.includes('"checkpoint":"max_heals"') || content.includes('"checkpoint": "max_heals"')) {
      return { label: 'Action required', color: '#ef4444', pulsing: true };
    }
    // DevOps / PR approval
    if (content.includes('"checkpoint":"devops"') || content.includes('"checkpoint": "devops"')) {
      return { label: 'PR approval needed', color: '#06b6d4', pulsing: true };
    }
    // Follow-up wait loop
    if (content.includes('Waiting for follow-up')) {
      return { label: 'Awaiting follow-up', color: '#f59e0b', pulsing: true };
    }
    // Actively building
    return {
      label: `${runningReports.length} agent${runningReports.length > 1 ? 's' : ''} building`,
      color: ACCENT,
      pulsing: true,
    };
  }

  if (reports.length === 0) return { label: 'No builds yet', color: 'var(--text-secondary)', pulsing: false };

  const latest = reports[0];
  const latestLive = liveStatuses.get(latest.taskId);

  if (latestLive === 'FAILED' || latest.summary?.includes('Failed')) {
    return { label: 'Failed', color: '#ef4444', pulsing: false };
  }
  if (latest.summary?.includes('✓ Complete') || latestLive === 'COMPLETED') {
    return { label: 'Complete', color: '#22c55e', pulsing: false };
  }
  if (latest.summary?.includes('⚠ Blocked')) {
    return { label: 'Blocked', color: '#ef4444', pulsing: false };
  }
  return { label: 'Idle', color: 'var(--text-secondary)', pulsing: false };
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

function PulsingDot({ color, pulsing }: { color: string; pulsing: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: pulsing ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
    }} />
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  card,
  liveStatuses,
  onClick,
  onDelete,
  onActivate,
}: {
  card: ProjectCard;
  liveStatuses: Map<string, string>;
  onClick: () => void;
  onDelete: () => void;
  onActivate: () => void;
}) {
  const { project, reports } = card;
  const { label, color, pulsing } = resolveStatus(reports, liveStatuses);
  const latestQuery = reports[0]?.query ?? null;
  const nextStep = card.nextStep;
  const lastDate = card.lastActivity ? new Date(card.lastActivity) : null;
  const relativeTime = lastDate ? formatRelative(lastDate) : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  function handleCopyLink() {
    setMenuOpen(false);
    const latest = reports[0];
    const url = latest
      ? `${window.location.origin}/task/${latest.taskId}`
      : window.location.origin;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Use a div as the card container so the menu can sit outside the clickable area
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = ACCENT + '80';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${ACCENT}12`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Clickable card body — navigates to task */}
      <div
        onClick={onClick}
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.875rem',
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
          {/* ⋯ menu — stops propagation so card click doesn't fire */}
          <div
            ref={menuRef}
            style={{ position: 'relative', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setMenuOpen(o => !o)}
              title="Project actions"
              style={{
                background: menuOpen ? 'var(--surface-raised)' : 'transparent',
                border: `1px solid ${menuOpen ? 'var(--border)' : 'transparent'}`,
                borderRadius: '6px', padding: '0.15rem 0.45rem',
                cursor: 'pointer', color: 'var(--text-secondary)',
                fontSize: '1.1rem', lineHeight: 1.4, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              }}
              onMouseLeave={e => {
                if (!menuOpen) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                }
              }}
            >
              ⋯
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                zIndex: 100, minWidth: '160px',
              }}>
                <button
                  onClick={() => { setMenuOpen(false); onActivate({} as React.MouseEvent); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    width: '100%', padding: '0.6rem 0.875rem',
                    background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.8125rem', color: 'var(--text-primary)', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  Set as active
                </button>
                <button
                  onClick={handleCopyLink}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    width: '100%', padding: '0.6rem 0.875rem',
                    background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.8125rem', color: 'var(--text-primary)', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete({} as React.MouseEvent); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    width: '100%', padding: '0.6rem 0.875rem',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.8125rem', color: '#ef4444', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ef444410'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  Delete project
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PulsingDot color={color} pulsing={pulsing} />
          <span style={{ fontSize: '0.78rem', color, fontWeight: 500 }}>{label}</span>
          {relativeTime && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto', opacity: 0.5 }}>
              {relativeTime}
            </span>
          )}
        </div>

        {/* Latest task */}
        {latestQuery && (
          <div style={{ background: 'var(--surface-raised)', borderRadius: '8px', padding: '0.5rem 0.625rem' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.5 }}>
            {reports.length} build{reports.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectCard | null>(null);
  const { activeProjectId, setActiveProjectId } = useProjectStore();

  const loadCards = useCallback(async () => {
    try {
      const projects = await listProjects();
      const built: ProjectCard[] = projects.map(project => {
        const reports = getReportsByProject(project.id);
        const activeCount = 0;
        const lastActivity = reports[0]?.createdAt ?? project.created_at;
        const latestSummary = reports.find(r => r.summary)?.summary ?? null;
        const nextStep = extractNextStep(latestSummary);
        return { project, reports, activeCount, lastActivity, latestSummary, nextStep };
      });
      setCards(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  const handleDelete = useCallback(async (card: ProjectCard) => {
    setDeletingId(card.project.id);
    setConfirmDelete(null);
    try {
      const taskIds = card.reports.map(r => r.taskId).filter(Boolean);
      await deleteProject(card.project.id, taskIds);
      // Clear localStorage reports for this project
      deleteReportsByProject(card.project.id);
      // Deselect if this was the active project
      if (activeProjectId === card.project.id) {
        setActiveProjectId(null);
      }
      // Reload cards
      await loadCards();
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeletingId(null);
    }
  }, [activeProjectId, setActiveProjectId, loadCards]);

  // Collect all task IDs across all projects for live status polling
  const allTaskIds = useMemo(
    () => cards.flatMap(c => c.reports.map(r => r.taskId)).filter(Boolean),
    [cards]
  );

  const { data: liveStatuses } = useTaskStatuses(allTaskIds);

  // Build a map of taskId → status for O(1) lookup in cards
  const statusMap = useMemo(() => {
    const m = new Map<string, string>();
    (liveStatuses ?? []).forEach(s => m.set(s.taskId, s.status));
    return m;
  }, [liveStatuses]);

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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        .project-card-wrap:hover .delete-btn { opacity: 1 !important; }
      `}</style>

      {/* Confirmation modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '1.75rem',
              maxWidth: '420px', width: '100%',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}
          >
            <div>
              <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Delete "{confirmDelete.project.name}"?
              </p>
              <p style={{ fontSize: '0.8375rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                This will permanently delete the project, all {confirmDelete.reports.length} build record{confirmDelete.reports.length !== 1 ? 's' : ''}, the repo directory, and terminate any running Temporal workflows. This cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '0.5rem 1rem',
                  fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deletingId === confirmDelete.project.id}
                style={{
                  background: '#ef4444', border: 'none',
                  borderRadius: '8px', padding: '0.5rem 1rem',
                  fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', color: 'white',
                  opacity: deletingId ? 0.6 : 1,
                }}
              >
                {deletingId === confirmDelete.project.id ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div key={card.project.id} className="project-card-wrap">
              <ProjectCard
                card={card}
                liveStatuses={statusMap}
                onClick={() => {
                  const latest = card.reports[0];
                  if (latest) router.push(`/task/${latest.taskId}`);
                  else router.push('/');
                }}
                onActivate={() => {
                  setActiveProjectId(card.project.id);
                }}
                onDelete={() => {
                  setConfirmDelete(card);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
