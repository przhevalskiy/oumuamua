'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getAllReports, deleteReport, type SavedReport } from '@/lib/report-store';

// ── Icons ─────────────────────────────────────────────────────────────────────

// panel-left-dashed — toggle sidebar
function IconPanelLeftClose() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2"/>
      <path d="M9 3v18" strokeDasharray="3 3"/>
    </svg>
  );
}

function IconPanelLeftOpen() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2"/>
      <path d="M15 3v18" strokeDasharray="3 3"/>
    </svg>
  );
}

// Lucide SquarePen — new research
function IconSquarePen() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
    </svg>
  );
}

function IconDots() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function IconCirclePile() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="19" r="2"/><circle cx="12" cy="5" r="2"/>
      <circle cx="16" cy="12" r="2"/><circle cx="20" cy="19" r="2"/>
      <circle cx="4" cy="19" r="2"/><circle cx="8" cy="12" r="2"/>
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function IconApi() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

// ── History entry ──────────────────────────────────────────────────────────────

function HistoryEntry({
  report,
  onDelete,
  collapsed,
}: {
  report: SavedReport;
  onDelete: () => void;
  collapsed: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname === `/r/${report.taskId}` || pathname === `/research/${report.taskId}`;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const menuItems = [
    {
      label: 'Activate',
      onClick: () => { router.push(`/research/${report.taskId}`); setMenuOpen(false); },
    },
    {
      label: 'Copy link',
      onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/r/${report.taskId}`); setMenuOpen(false); },
    },
    {
      label: 'Export',
      onClick: () => {
        const blob = new Blob([report.answer ?? report.query], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${report.taskId}.md`; a.click();
        URL.revokeObjectURL(url);
        setMenuOpen(false);
      },
    },
    {
      label: 'Delete',
      danger: true,
      onClick: () => { onDelete(); setMenuOpen(false); },
    },
  ];

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Link
        href={`/r/${report.taskId}`}
        title={collapsed ? report.query : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0.5rem 0' : '0.35rem 0.75rem',
          borderRadius: '8px',
          textDecoration: 'none',
          background: isActive ? 'var(--surface-raised)' : hovering ? 'var(--surface-hover)' : 'transparent',
          transition: 'background 0.12s ease',
          justifyContent: collapsed ? 'center' : 'flex-start',
          minWidth: 0,
          paddingRight: hovering && !collapsed ? '2rem' : collapsed ? '0' : '0.75rem',
        }}
      >
        {!collapsed && (
          <span style={{
            fontSize: '0.8375rem',
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isActive ? 'var(--text-primary)' : '#444444',
          }}>
            {report.query}
          </span>
        )}
      </Link>

      {hovering && !collapsed && (
        <button
          onClick={e => { e.preventDefault(); setMenuOpen(o => !o); }}
          title="More options"
          style={{
            position: 'absolute',
            right: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: menuOpen ? 'var(--surface-raised)' : 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.2rem 0.3rem',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px',
          }}
        >
          <IconDots />
        </button>
      )}

      {menuOpen && !collapsed && (
        <div ref={menuRef} style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 2px)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '0.3rem',
          zIndex: 50,
          minWidth: '140px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.125rem',
        }}>
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={e => { e.preventDefault(); item.onClick(); }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.625rem',
                textAlign: 'left',
                fontSize: '0.8125rem',
                color: item.danger ? 'var(--error)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.1s ease, color 0.1s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
                if (!item.danger) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = item.danger ? 'var(--error)' : 'var(--text-secondary)';
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('oumuamua_sidebar_collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    setReports(getAllReports());
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem('oumuamua_sidebar_collapsed', String(!c));
      return !c;
    });
  }

  function handleDelete(taskId: string) {
    deleteReport(taskId);
    setReports(prev => prev.filter(r => r.taskId !== taskId));
  }

  return (
    <aside style={{
      width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0,
    }}>

      {/* Top: title + collapse toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '1rem 0.5rem' : '0.875rem 1rem',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <Link href="/" style={{
            textDecoration: 'none',
            color: 'var(--text-primary)',
            fontSize: '1.125rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}>
            Oumuamua
          </Link>
        )}

        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.3rem',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '6px',
            flexShrink: 0,
            opacity: 0.6,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
        >
          {collapsed ? <IconPanelLeftOpen /> : <IconPanelLeftClose />}
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ padding: collapsed ? '0 0 0.75rem' : '0 0.25rem 0.75rem', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        {[
          { icon: <IconApi />, label: 'Docs', title: 'Docs', onClick: undefined },
          { icon: <IconDownload />, label: 'Exports', title: 'Export reports', onClick: undefined },
          { icon: <IconCirclePile />, label: 'Agents', title: 'Agents', onClick: undefined },
          { icon: <IconSquarePen />, label: 'New Task', title: 'New Task', onClick: () => router.push('/') },
        ].map(({ icon, label, title, onClick }) => (
          <button
            key={label}
            title={collapsed ? title : undefined}
            onClick={onClick}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '0.625rem',
              padding: collapsed ? '0.5rem 0' : '0.4rem 0.75rem',
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              fontWeight: 400,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
              fontFamily: 'inherit',
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
            <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </div>

      {/* History label */}
      {!collapsed && (
        <div style={{ padding: '0', flexShrink: 0 }}>
          <span style={{
            display: 'block',
            padding: '0.375rem 1rem',
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
          }}>
            History
          </span>
        </div>
      )}

      {/* History list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: collapsed ? '0.25rem 0' : '0.125rem 0.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.0625rem',
      }}>
        {reports.length === 0 && !collapsed && (
          <p style={{
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            padding: '0.375rem 0.75rem',
            opacity: 0.5,
          }}>
            No research yet
          </p>
        )}

        {reports.slice(0, 20).map(report => (
          <HistoryEntry
            key={report.taskId}
            report={report}
            onDelete={() => handleDelete(report.taskId)}
            collapsed={collapsed}
          />
        ))}
      </div>

      {/* Settings — no border top */}
      <div style={{
        padding: collapsed ? '0.75rem 0.5rem' : '0.75rem',
        flexShrink: 0,
      }}>
        <button
          title="Settings"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: collapsed ? '0.5rem 0' : '0.4rem 0.75rem',
            background: 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            justifyContent: collapsed ? 'center' : 'flex-start',
            fontFamily: 'inherit',
            transition: 'background 0.12s ease, color 0.12s ease',
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
          <span style={{ flexShrink: 0, display: 'flex' }}><IconSettings /></span>
          {!collapsed && <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>Settings</span>}
        </button>
      </div>

    </aside>
  );
}
