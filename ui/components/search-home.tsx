'use client';

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateTask } from '@/hooks/use-create-task';
import { useAgentConfigStore } from '@/lib/agent-config-store';
import { saveReport } from '@/lib/report-store';
import { useFileAttachments, buildAttachmentBlock } from '@/hooks/use-file-attachments';
import { useActiveProject } from '@/lib/use-projects';

const SUGGESTION_CATEGORIES: { label: string; items: string[] }[] = [
  {
    label: 'Web App',
    items: [
      'Build a SaaS dashboard with Next.js, Tailwind, and Supabase auth',
      'Create a React e-commerce storefront with cart, checkout, and Stripe',
      'Build a multi-tenant admin panel with role-based access control',
      'Create a real-time collaborative whiteboard with WebSockets',
      'Build a full-stack blog with a headless CMS and RSS feed',
      'Create a Kanban board app with drag-and-drop and team sharing',
      'Build a social network with profiles, follows, and activity feed',
      'Create a booking and scheduling platform with calendar integration',
    ],
  },
  {
    label: 'API',
    items: [
      'Build a REST API with FastAPI, PostgreSQL, and JWT auth',
      'Create a GraphQL API with subscriptions and DataLoader',
      'Build a gRPC microservice with Protobuf schemas',
      'Create a WebSocket server for real-time event streaming',
      'Build a rate-limited public API with API key management',
      'Create an OpenAPI-documented CRUD service with Swagger UI',
      'Build a webhook delivery system with retries and event logs',
      'Create a search API with Elasticsearch full-text and filters',
    ],
  },
  {
    label: 'Mobile',
    items: [
      'Build a React Native iOS and Android app with Expo',
      'Create a fitness tracker with local storage, charts, and reminders',
      'Build a push-notification enabled news reader in React Native',
      'Create a cross-platform expense tracker with offline sync',
      'Build a social feed app with camera, likes, and comments',
      'Create a food delivery app with maps, order tracking, and payments',
      'Build a habit tracker with streaks, badges, and weekly reports',
    ],
  },
  {
    label: 'Data / ML',
    items: [
      'Build an ETL pipeline with Airflow, dbt, and Postgres',
      'Create a machine learning inference API with FastAPI and scikit-learn',
      'Build a real-time analytics dashboard with ClickHouse and Grafana',
      'Create a RAG chatbot with LangChain, embeddings, and vector search',
      'Build a data scraper with deduplication, scheduling, and alerts',
      'Create a model fine-tuning pipeline with experiment tracking in MLflow',
      'Build a recommendation engine with collaborative filtering',
      'Create a document classification system with confidence scores',
    ],
  },
  {
    label: 'DevOps',
    items: [
      'Set up a CI/CD pipeline with GitHub Actions, Docker, and auto-deploy',
      'Create Kubernetes manifests with Helm charts and resource limits',
      'Build a Terraform infrastructure module for AWS ECS + RDS',
      'Set up observability with OpenTelemetry, Prometheus, and Grafana',
      'Create a Docker Compose dev environment with hot reload and seed data',
      'Build a self-hosted deployment with Nginx, SSL, and rolling updates',
      'Create a secrets management system with Vault and rotation policies',
      'Build a multi-environment deployment pipeline with approval gates',
    ],
  },
  {
    label: 'CLI / Tools',
    items: [
      'Build a CLI tool in Python with Rich, subcommands, and config files',
      'Create a code generator that scaffolds projects from templates',
      'Build a Git hook toolkit with lint, type-check, and commit formatting',
      'Create a local dev proxy with request logging and mock responses',
      'Build an automated dependency audit and update tool',
      'Create a dotfiles manager with symlinks and machine profiles',
      'Build a terminal dashboard for monitoring system resources',
    ],
  },
  {
    label: 'Realtime',
    items: [
      'Build a multiplayer chat app with rooms, presence, and history',
      'Create a live coding interview platform with shared editor and video',
      'Build a real-time stock ticker dashboard with WebSocket feeds',
      'Create a collaborative document editor with conflict resolution (CRDT)',
      'Build a live auction platform with bidding, timers, and notifications',
      'Create a sports score tracker with live commentary and push alerts',
      'Build a shared music queue with voting and playback sync',
    ],
  },
  {
    label: 'Game',
    items: [
      'Build a browser-based Tetris clone with leaderboard',
      'Create a multiplayer tic-tac-toe game with matchmaking',
      'Build a text adventure engine with branching story and inventory',
      'Create a 2D platformer with Phaser.js and level editor',
      'Build a chess game with AI opponent using minimax',
      'Create a tower defense game with wave editor and upgrades',
      'Build a trivia game with categories, timers, and score history',
      'Create a card battle game with deck building and multiplayer rooms',
    ],
  },
  {
    label: 'Auth / Identity',
    items: [
      'Build a full auth system with OAuth2, MFA, and session management',
      'Create a passwordless login flow with magic links and TOTP',
      'Build an SSO provider with SAML 2.0 and OIDC support',
      'Create an API key management portal with scopes and audit logs',
      'Build a permission system with roles, resources, and policy engine',
      'Create a user onboarding flow with email verification and profile setup',
    ],
  },
  {
    label: 'E-commerce',
    items: [
      'Build a Shopify-style storefront with product variants and inventory',
      'Create a subscription billing system with Stripe and plan management',
      'Build a marketplace with multi-vendor payouts and escrow',
      'Create a digital downloads platform with license key generation',
      'Build a B2B wholesale portal with tiered pricing and net terms',
      'Create a flash sale engine with countdown timers and stock limits',
    ],
  },
  {
    label: 'AI / Agents',
    items: [
      'Build an AI coding assistant with file context and inline suggestions',
      'Create a multi-agent research pipeline with source citations',
      'Build a document Q&A system with PDF parsing and RAG',
      'Create an AI customer support bot with escalation and ticket creation',
      'Build an autonomous web scraper agent with self-correcting retries',
      'Create a personal AI assistant with memory, tools, and calendar access',
      'Build a code review agent that flags bugs, security issues, and style',
    ],
  },
  {
    label: 'Finance',
    items: [
      'Build a personal finance tracker with budgets, goals, and reports',
      'Create a crypto portfolio tracker with live prices and P&L',
      'Build an invoice generator with PDF export and payment tracking',
      'Create a payroll processing system with tax calculations',
      'Build a trading journal with strategy tagging and performance analytics',
      'Create an expense approval workflow with receipts and accounting export',
    ],
  },
  {
    label: 'Productivity',
    items: [
      'Build a note-taking app with markdown, tags, and full-text search',
      'Create a project management tool with tasks, milestones, and Gantt chart',
      'Build a CRM with contact management, pipeline, and email tracking',
      'Create a meeting scheduler with availability sync and video links',
      'Build a bookmark manager with AI tagging and browser extension',
      'Create a daily planner with time blocking, habits, and weekly review',
    ],
  },
  {
    label: 'Media',
    items: [
      'Build a video streaming platform with transcoding and adaptive bitrate',
      'Create a podcast hosting platform with RSS, analytics, and chapters',
      'Build an image gallery with AI tagging, albums, and sharing',
      'Create a music streaming app with playlists, lyrics, and scrobbling',
      'Build a screen recording tool with annotations and team sharing',
      'Create a newsletter platform with editor, scheduling, and open tracking',
    ],
  },
  {
    label: 'IoT / Hardware',
    items: [
      'Build a home automation dashboard for MQTT devices',
      'Create a sensor data ingestion pipeline with time-series storage',
      'Build a fleet management system for IoT device telemetry',
      'Create a firmware OTA update service with rollback and versioning',
      'Build an alert system for threshold breaches on sensor readings',
    ],
  },
];

type TierKey = 'auto' | 'lightweight' | 'standard' | 'full';

const TIER_OPTIONS: { key: TierKey; label: string; value: number | undefined; desc: string }[] = [
  { key: 'auto',        label: 'Auto',       value: undefined, desc: 'Auto-detect from goal' },
  { key: 'lightweight', label: 'Lightweight', value: 1,         desc: '1 track · 1 heal · no security' },
  { key: 'standard',    label: 'Standard',    value: 2,         desc: '2 tracks · 2 heals · full scan' },
  { key: 'full',        label: 'Full Crew',   value: 3,         desc: '4 tracks · max heals · enterprise' },
];

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, setOpen, ref };
}

export function SearchHome() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const [tierKey, setTierKey] = useState<TierKey>('auto');
  const [fileDragging, setFileDragging] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [categoryFlip, setCategoryFlip] = useState<'up' | 'down'>('down');
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const tierDropdown = useDropdown();
  const fileDropdown = useDropdown();
  const projectDropdown = useDropdown();
  const [newProjectName, setNewProjectName] = useState('');
  const [newGithubUrl, setNewGithubUrl] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);

  useEffect(() => {
    if (!openCategory) return;
    const handler = (e: MouseEvent) => {
      const ref = categoryRefs.current[openCategory];
      if (ref && !ref.contains(e.target as Node)) setOpenCategory(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCategory]);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: createTask, isPending } = useCreateTask();
  const swarmConfig = useAgentConfigStore(s => s.config);
  const { files: attachedFiles, error: attachError, addFiles, removeFile, clearAll: clearFiles } = useFileAttachments();
  const { activeProject, projects, addProject, selectProject } = useActiveProject();

  function goalToProjectName(goal: string): string {
    // "Build a habit tracker with streaks" → "habit-tracker"
    const stopWords = new Set(['a', 'an', 'the', 'with', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'from', 'build', 'create', 'make', 'add', 'implement', 'write', 'develop', 'design', 'set', 'up']);
    const words = goal
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w))
      .slice(0, 3);
    return words.join('-') || 'project';
  }

  async function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setError('');

    const attachmentBlock = buildAttachmentBlock(attachedFiles);
    const fullQuery = trimmed + attachmentBlock;
    const tierOption = TIER_OPTIONS.find(t => t.key === tierKey);
    const extraTier = tierOption?.value !== undefined ? { tier: tierOption.value } : {};

    // If no project is selected, auto-create one named from the goal
    let project = activeProject;
    if (!project) {
      try {
        const name = goalToProjectName(trimmed);
        project = await addProject(name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create project.');
        return;
      }
    }

    createTask({
      query: fullQuery,
      extraParams: {
        repo_path: project.repo_path,
        project_id: project.id,
        branch_prefix: swarmConfig.swarmBranchPrefix || 'swarm',
        max_heal_cycles: swarmConfig.swarmMaxHealCycles,
        ...extraTier,
        ...(project.github_url ? { github_url: project.github_url } : {}),
        ...(swarmConfig.githubToken ? { github_token: swarmConfig.githubToken } : {}),
      },
    }, {
      onSuccess: (task) => {
        saveReport({ taskId: task.id, query: trimmed, answer: '', createdAt: new Date().toISOString(), projectId: project!.id });
        clearFiles();
        router.push(`/task/${task.id}`);
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : 'Failed to start. Is the agent running?'),
    });
  }

  function onFormSubmit(e: React.FormEvent) { e.preventDefault(); void handleSubmit(query); }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void handleSubmit(query); }
  }

  const canSubmit = !isPending && !!query.trim();
  const ACCENT = '#f97316';

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
      <style>{`
        @keyframes chibi-wave {
          0%    { transform: translateY(0px) scale(1); }
          8%    { transform: translateY(-16px) scale(1.1); }
          16%   { transform: translateY(0px) scale(1); }
          100%  { transform: translateY(0px) scale(1); }
        }
        .chibi-avatar {
          animation: chibi-wave 9s ease-in-out infinite;
          will-change: transform;
        }
      `}</style>

      {/* Chibi crew row — one avatar per agent in the platform */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {[
            { n: 1,  label: 'Foreman',   color: '#f97316' }, // orange
            { n: 4,  label: 'PM',         color: '#8b5cf6' }, // violet
            { n: 7,  label: 'Architect',  color: '#3b82f6' }, // blue
            { n: 10, label: 'Builder',    color: '#10b981' }, // emerald
            { n: 18, label: 'Inspector',  color: '#f59e0b' }, // amber
            { n: 22, label: 'Security',   color: '#ef4444' }, // red
            { n: 25, label: 'DevOps',     color: '#06b6d4' }, // cyan
          ].map(({ n, label, color }, i) => (
            <div
              key={label}
              title={label}
              className="chibi-avatar"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                padding: '3px',
                background: color,
                marginLeft: i === 0 ? '0' : '-18px',
                zIndex: i,
                position: 'relative',
                animationDelay: `${(i * 0.22).toFixed(2)}s`,
                flexShrink: 0,
                boxSizing: 'border-box',
                filter: 'drop-shadow(-3px 0 4px rgba(0,0,0,0.15))',
              }}
            >
              <img
                src={`/avatars/avatar-${String(n).padStart(2, '0')}.png`}
                alt={label}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                  display: 'block',
                  background: 'var(--background)',
                }}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: '1.33rem', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.01em' }}>
          Your durable engineering crew
        </p>
      </div>

      {/* Input card */}
      <div style={{ width: '100%', maxWidth: '680px' }}>
        <form onSubmit={onFormSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
          />

          <div
            style={{
              background: 'var(--surface)',
              border: `1px solid ${fileDragging ? ACCENT : focused ? ACCENT : error ? 'var(--error)' : 'var(--border)'}`,
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              transition: 'border-color 0.15s ease',
              outline: fileDragging ? `2px dashed ${ACCENT}` : 'none',
              outlineOffset: '2px',
            }}
            onDragOver={e => { e.preventDefault(); setFileDragging(true); }}
            onDragLeave={() => setFileDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setFileDragging(false);
              if (e.dataTransfer.files.length) { addFiles(e.dataTransfer.files); fileDropdown.setOpen(true); }
            }}
          >
            {/* File chips */}
            {attachedFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.625rem 1rem 0 4rem' }}>
                {attachedFiles.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: 'var(--surface-raised)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '0.2rem 0.5rem',
                    fontSize: '0.72rem', color: 'var(--text-secondary)', maxWidth: '200px',
                  }}>
                    <IconFile />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ opacity: 0.5, fontSize: '0.65rem', flexShrink: 0 }}>
                      {f.size > 1000 ? `${(f.size / 1000).toFixed(0)}k` : `${f.size}b`}
                    </span>
                    <button type="button" onClick={() => removeFile(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Main row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem' }}>

              {/* Left: wrench only */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>

                {/* Wrench — file dropdown */}
                <div ref={fileDropdown.ref} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => fileDropdown.setOpen(p => !p)}
                    disabled={isPending}
                    title="Attach files to context"
                    style={{
                      background: 'none',
                      border: `1px solid ${attachedFiles.length ? ACCENT : 'var(--border)'}`,
                      borderRadius: '50%', padding: '5px', cursor: 'pointer',
                      color: attachedFiles.length ? ACCENT : 'var(--text-secondary)',
                      opacity: attachedFiles.length ? 1 : 0.5,
                      display: 'flex', transition: 'color 0.12s, opacity 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = attachedFiles.length ? '1' : '0.5'; }}
                  >
                    <IconWrench />
                  </button>

                  {/* File dropdown panel */}
                  {fileDropdown.open && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: '12px', overflow: 'hidden',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                      zIndex: 200, width: '260px',
                    }}>
                      {/* Drop zone */}
                      <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: '1rem',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: 'var(--surface-raised)',
                          textAlign: 'center',
                          transition: 'background 0.12s',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          Drop files or click to browse
                        </p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          Text, code, JSON — up to 100 KB
                        </p>
                      </div>

                      {/* File list */}
                      {attachedFiles.length > 0 ? (
                        <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          {attachedFiles.map((f, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              borderBottom: i < attachedFiles.length - 1 ? '1px solid var(--border)' : 'none',
                            }}>
                              <IconFile />
                              <span style={{ flex: 1, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                                {f.size > 1000 ? `${(f.size / 1000).toFixed(0)}k` : `${f.size}b`}
                              </span>
                              <button type="button" onClick={() => removeFile(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', lineHeight: 1, fontSize: '0.78rem' }}>✕</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '0.625rem 0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No files attached</span>
                        </div>
                      )}

                      {/* Footer */}
                      {attachedFiles.length > 0 && (
                        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''}
                          </span>
                          <button type="button" onClick={clearFiles}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                            Clear all
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={fileDragging ? 'Drop files here…' : 'Describe what to build, fix, or refactor...'}
                disabled={isPending}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: '0.9375rem', color: 'var(--text-primary)',
                  fontFamily: 'inherit', minWidth: 0,
                }}
              />

              {/* Send */}
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
                  background: canSubmit ? ACCENT : 'var(--surface-raised)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s ease',
                  color: canSubmit ? 'white' : 'var(--text-secondary)',
                }}
              >
                {isPending ? <SpinnerIcon size={15} /> : <IconArrowUp />}
              </button>
            </div>

            {/* Bottom row: project pill left, crew right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1rem 0.625rem' }}>
              {/* Project selector pill */}
              <div ref={projectDropdown.ref} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    setShowNewProjectInput(false);
                    projectDropdown.setOpen(p => !p);
                  }}
                  disabled={isPending}
                  style={{
                    background: activeProject ? `${ACCENT}18` : 'transparent',
                    border: `1px solid ${activeProject ? ACCENT : 'var(--border)'}`,
                    borderRadius: '999px',
                    padding: '0.2rem 0.65rem',
                    color: activeProject ? ACCENT : 'var(--text-secondary)',
                    fontSize: '0.72rem',
                    fontWeight: activeProject ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    transition: 'all 0.12s ease',
                    maxWidth: '160px',
                  }}
                >
                  <IconFolder size={11} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeProject ? activeProject.name : 'New project'}
                  </span>
                  {activeProject?.github_url && (
                    <span title={activeProject.github_url} style={{ fontSize: '0.6rem', opacity: 0.7, flexShrink: 0 }}>⎇</span>
                  )}
                  <span style={{ opacity: 0.4, fontSize: '0.6rem', flexShrink: 0 }}>▾</span>
                </button>

                {projectDropdown.open && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '10px', overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    zIndex: 200, minWidth: '220px',
                  }}>
                    {/* Deselect option — only shown when a project is active */}
                    {activeProject && (
                      <button
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          selectProject(null as unknown as string);
                          projectDropdown.setOpen(false);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          width: '100%', padding: '0.625rem 0.875rem',
                          background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                          color: 'var(--text-secondary)', fontSize: '0.8125rem',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <span style={{ opacity: 0.4, fontSize: '0.75rem' }}>✕</span>
                        <span>New project (auto)</span>
                      </button>
                    )}
                    {projects.length === 0 && !showNewProjectInput && !activeProject && (
                      <div style={{ padding: '0.625rem 0.875rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No projects yet</span>
                      </div>
                    )}
                    {projects.map((p, idx) => {
                      const active = activeProject?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            selectProject(p.id);
                            projectDropdown.setOpen(false);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            width: '100%', padding: '0.625rem 0.875rem',
                            background: active ? `${ACCENT}12` : 'transparent',
                            border: 'none',
                            borderBottom: idx < projects.length - 1 || showNewProjectInput ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                          }}
                        >
                          <IconFolder size={12} />
                          <span style={{ fontSize: '0.8125rem', fontWeight: active ? 600 : 400, color: active ? ACCENT : 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </span>
                          {active && <span style={{ fontSize: '0.65rem', color: ACCENT }}>✓</span>}
                        </button>
                      );
                    })}

                    {showNewProjectInput ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', padding: '0.5rem 0.75rem', borderTop: projects.length > 0 ? '1px solid var(--border)' : 'none' }}>
                        <input
                          autoFocus
                          value={newProjectName}
                          onChange={e => setNewProjectName(e.target.value)}
                          onKeyDown={async e => {
                            if (e.key !== 'Enter') return;
                            e.stopPropagation();
                            const name = newProjectName.trim();
                            if (!name || creatingProject) return;
                            setCreatingProject(true);
                            try {
                              await addProject(name, newGithubUrl.trim() || undefined);
                              setNewProjectName('');
                              setNewGithubUrl('');
                              setShowNewProjectInput(false);
                              projectDropdown.setOpen(false);
                            } catch { /* keep open */ } finally { setCreatingProject(false); }
                          }}
                          placeholder="Project name"
                          style={{
                            border: '1px solid var(--border)', borderRadius: '6px',
                            padding: '0.25rem 0.5rem', fontSize: '0.78rem',
                            background: 'var(--surface-raised)', color: 'var(--text-primary)',
                            fontFamily: 'inherit', outline: 'none',
                          }}
                        />
                        <input
                          value={newGithubUrl}
                          onChange={e => setNewGithubUrl(e.target.value)}
                          placeholder="GitHub URL (optional) — https://github.com/owner/repo"
                          style={{
                            border: '1px solid var(--border)', borderRadius: '6px',
                            padding: '0.25rem 0.5rem', fontSize: '0.72rem',
                            background: 'var(--surface-raised)', color: 'var(--text-secondary)',
                            fontFamily: 'monospace', outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button
                            type="button"
                            disabled={creatingProject || !newProjectName.trim()}
                            onClick={async () => {
                              const name = newProjectName.trim();
                              if (!name || creatingProject) return;
                              setCreatingProject(true);
                              try {
                                await addProject(name, newGithubUrl.trim() || undefined);
                                setNewProjectName('');
                                setNewGithubUrl('');
                                setShowNewProjectInput(false);
                                projectDropdown.setOpen(false);
                              } catch { /* keep open */ } finally { setCreatingProject(false); }
                            }}
                            style={{
                              flex: 1, background: ACCENT, border: 'none', borderRadius: '6px',
                              padding: '0.25rem 0.5rem', color: 'white',
                              fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                              fontFamily: 'inherit', opacity: creatingProject ? 0.6 : 1,
                            }}
                          >
                            {creatingProject ? '…' : 'Create'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowNewProjectInput(false); setNewProjectName(''); setNewGithubUrl(''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0 0.25rem' }}
                          >✕</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowNewProjectInput(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          width: '100%', padding: '0.625rem 0.875rem',
                          background: 'transparent', border: 'none',
                          borderTop: projects.length > 0 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: '0.8125rem', color: ACCENT,
                        }}
                      >
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>＋</span> New project
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div ref={tierDropdown.ref} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); tierDropdown.setOpen(p => !p); }}
                  disabled={isPending}
                  style={{
                    background: tierKey !== 'auto' ? `${ACCENT}18` : 'transparent',
                    border: `1px solid ${tierKey !== 'auto' ? ACCENT : 'var(--border)'}`,
                    borderRadius: '999px',
                    padding: '0.2rem 0.65rem',
                    color: tierKey !== 'auto' ? ACCENT : 'var(--text-secondary)',
                    fontSize: '0.72rem',
                    fontWeight: tierKey !== 'auto' ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>Crew</span>
                  {TIER_OPTIONS.find(t => t.key === tierKey)?.label}
                  <span style={{ opacity: 0.4, fontSize: '0.6rem' }}>▾</span>
                </button>

                {tierDropdown.open && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '10px', overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    zIndex: 200, minWidth: '200px',
                  }}>
                    {TIER_OPTIONS.map((opt, idx) => {
                      const active = tierKey === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            setTierKey(opt.key);
                            tierDropdown.setOpen(false);
                          }}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                            width: '100%', padding: '0.625rem 0.875rem',
                            background: active ? `${ACCENT}12` : 'transparent',
                            border: 'none',
                            borderBottom: idx < TIER_OPTIONS.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: '0.8125rem', fontWeight: active ? 600 : 400, color: active ? ACCENT : 'var(--text-primary)' }}>
                            {opt.label}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div> {/* end bottom row */}
          </div>

          {(error || attachError) && (
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '0.375rem', paddingLeft: '1.25rem' }}>
              {error || attachError}
            </p>
          )}
        </form>

        {/* Category suggestions */}
        <div style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
          {SUGGESTION_CATEGORIES.map(cat => {
            const isOpen = openCategory === cat.label;
            return (
              <div
                key={cat.label}
                ref={el => { categoryRefs.current[cat.label] = el; }}
                style={{ position: 'relative' }}
              >
                <button
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    if (isOpen) { setOpenCategory(null); return; }
                    const btn = e.currentTarget as HTMLButtonElement;
                    const rect = btn.getBoundingClientRect();
                    const estimatedHeight = cat.items.length * 48 + 16;
                    const flip = rect.bottom + estimatedHeight > window.innerHeight ? 'up' : 'down';
                    setCategoryFlip(flip);
                    setOpenCategory(cat.label);
                  }}
                  disabled={isPending}
                  style={{
                    background: isOpen ? ACCENT : 'transparent',
                    border: `1px solid ${isOpen ? ACCENT : 'var(--border)'}`,
                    borderRadius: '999px',
                    padding: '0.375rem 0.875rem',
                    color: isOpen ? 'white' : 'var(--text-secondary)',
                    fontSize: '0.8125rem', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.12s ease',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}
                >
                  {cat.label}
                  <span style={{ opacity: 0.6, fontSize: '0.6rem' }}>{isOpen ? '▴' : '▾'}</span>
                </button>

                {isOpen && (
                  <div style={{
                    position: 'absolute',
                    ...(categoryFlip === 'up'
                      ? { bottom: 'calc(100% + 6px)' }
                      : { top: 'calc(100% + 6px)' }),
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '12px', overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    zIndex: 300, minWidth: '280px', maxWidth: '340px',
                    maxHeight: '60vh', overflowY: 'auto',
                  }}>
                    {cat.items.map((item, idx) => (
                      <button
                        key={item}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          setQuery(item);
                          setOpenCategory(null);
                          inputRef.current?.focus();
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '0.625rem 0.875rem',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: idx < cat.items.length - 1 ? '1px solid var(--border)' : 'none',
                          fontSize: '0.8125rem', color: 'var(--text-primary)',
                          cursor: 'pointer', fontFamily: 'inherit',
                          lineHeight: '1.4',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${ACCENT}10`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IconFolder({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconFile() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function IconWrench() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
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
