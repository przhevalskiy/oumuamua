'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

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

function IconGrid() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14"/>
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

function IconAgents() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="19" r="2"/><circle cx="12" cy="5" r="2"/>
      <circle cx="16" cy="12" r="2"/><circle cx="20" cy="19" r="2"/>
      <circle cx="4" cy="19" r="2"/><circle cx="8" cy="12" r="2"/>
    </svg>
  );
}

type NavItem = {
  icon: React.ReactNode;
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { icon: <IconPlus />,    label: 'New Build',  href: '/' },
  { icon: <IconGrid />,    label: 'Projects',   href: '/projects' },
  { icon: <IconAgents />,  label: 'Agents',     href: '/agents' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem('keystone_sidebar_collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem('keystone_sidebar_collapsed', String(!c));
      return !c;
    });
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

      {/* Logo + collapse */}
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
            Keystone
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
            padding: '0.3rem', display: 'flex', alignItems: 'center',
            borderRadius: '6px', flexShrink: 0, opacity: 0.6,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
        >
          {collapsed ? <IconPanelLeftOpen /> : <IconPanelLeftClose />}
        </button>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: collapsed ? '0 0.25rem' : '0 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '0.625rem',
                padding: collapsed ? '0.55rem 0' : '0.45rem 0.75rem',
                borderRadius: '8px',
                textDecoration: 'none',
                background: isActive ? 'var(--surface-raised)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.875rem',
                fontWeight: isActive ? 500 : 400,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-hover)';
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                }
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Settings — bottom */}
      <div style={{ padding: collapsed ? '0.75rem 0.75rem' : '0.75rem', flexShrink: 0 }}>
        <Link
          href="/agents"
          title={collapsed ? 'Settings' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '0.625rem',
            padding: collapsed ? '0.5rem 0' : '0.4rem 0.75rem',
            borderRadius: '8px',
            textDecoration: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            fontWeight: 400,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-hover)';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
          }}
        >
          <span style={{ flexShrink: 0, display: 'flex' }}><IconSettings /></span>
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>

    </aside>
  );
}
