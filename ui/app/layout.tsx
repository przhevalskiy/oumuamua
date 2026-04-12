import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { Providers } from '@/components/providers';
import { Sidebar } from '@/components/sidebar';

export const metadata: Metadata = {
  title: 'Oumuamua — Deep Research',
  description: 'AI-powered web research. Multi-source synthesis with live browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const agentexAPIBaseURL =
    process.env.NEXT_PUBLIC_AGENTEX_API_BASE_URL ?? 'http://localhost:5003';
  const agentName = process.env.NEXT_PUBLIC_AGENT_NAME ?? 'web-scout';

  return (
    <html lang="en" className={GeistSans.className}>
      <body>
        <Providers agentexAPIBaseURL={agentexAPIBaseURL} agentName={agentName}>
          <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, overflowY: 'auto', height: '100vh' }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
