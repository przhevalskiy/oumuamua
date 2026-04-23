'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';

function IconPanelLeft() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTaskRoute = pathname.startsWith('/task/') || pathname.startsWith('/r/');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isTaskRoute) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        {/* Floating sidebar drawer */}
        {sidebarOpen && (
          <>
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 40,
                background: 'rgba(0,0,0,0.3)',
              }}
            />
            <div style={{
              position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50,
              boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
            }}>
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        <main style={{ flex: 1, overflow: 'hidden', height: '100vh' }}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', height: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
