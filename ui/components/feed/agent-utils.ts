'use client';

import { ROLE_TO_SPRITE, type SwarmRole } from '../chibi-avatar';

export type MsgContent = {
  type?: string;
  content?: unknown;
  name?: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
};

export const TAGGED_RE = /^\[(PM|Foreman|Architect|Builder|Inspector|Security|DevOps|Scout|Agent|Analyst|Verifier|Critic)(?:\s+(\d+)|\s+\(([^)]+)\))?\]\s*/;

export type AgentType = SwarmRole;

export function parseTaggedMessage(text: string): {
  type: AgentType;
  index: number;
  trackLabel: string | null;
  body: string;
} | null {
  const m = text.match(TAGGED_RE);
  if (!m) return null;
  const rawType = m[1].toLowerCase();
  const index = m[2] != null ? parseInt(m[2], 10) : 0;
  const trackLabel = m[3] ?? null;
  const body = text.slice(m[0].length);
  const type: AgentType = (rawType === 'agent' || rawType === 'analyst')
    ? 'analyst'
    : (rawType as AgentType);
  return { type, index, trackLabel, body };
}

const _trackColorRegistry = new Map<string, number>();

export function builderColorIndex(index: number, trackLabel: string | null): number {
  const key = trackLabel ?? String(index);
  if (!_trackColorRegistry.has(key)) {
    _trackColorRegistry.set(key, _trackColorRegistry.size);
  }
  return _trackColorRegistry.get(key)!;
}

export function seedBuilderColors(tracks: string[]) {
  tracks.forEach((t, i) => {
    if (!_trackColorRegistry.has(t)) _trackColorRegistry.set(t, i);
  });
}

export function agentSpriteIdxByType(type: AgentType, index: number): number {
  if (type === 'analyst') {
    const slots = [13, 15, 19, 23, 5, 9];
    return slots[index % slots.length];
  }
  return ROLE_TO_SPRITE[type as SwarmRole] ?? 1;
}

export const ROLE_LABEL: Record<string, string> = {
  pm: 'PM', foreman: 'Foreman', architect: 'Architect', builder: 'Builder',
  inspector: 'Inspector', security: 'Security', devops: 'DevOps',
  scout: 'Scout', analyst: 'Analyst', verifier: 'Verifier', critic: 'Critic',
};

export const ROLE_ACCENT: Record<string, string> = {
  foreman:   '#f97316',
  pm:        '#8b5cf6',
  architect: '#3b82f6',
  builder:   '#10b981',
  inspector: '#f59e0b',
  security:  '#ef4444',
  devops:    '#06b6d4',
  scout:     '#6366f1',
  analyst:   '#ec4899',
  verifier:  '#14b8a6',
  critic:    '#f43f5e',
};

export function humanizeToolAction(toolName: string, detail: string): string {
  const d = detail.trim();
  const filename = d.split('/').pop() ?? d;

  if (toolName === 'write_file') {
    if (filename.includes('package')) return `Setting up package configuration`;
    if (filename.match(/\.(tsx?|jsx?)$/)) return `Writing ${filename}`;
    if (filename.match(/\.(css|scss|sass)$/)) return `Styling ${filename}`;
    if (filename.match(/\.(json|yaml|yml|toml)$/)) return `Configuring ${filename}`;
    if (filename.match(/\.(md|txt)$/)) return `Documenting ${filename}`;
    if (filename.match(/dockerfile/i)) return `Writing Dockerfile`;
    return `Writing ${filename}`;
  }

  if (toolName === 'patch_file') return `Updating ${filename}`;
  if (toolName === 'read_file') return `Reading ${filename}`;
  if (toolName === 'delete_file') return `Removing ${filename}`;
  if (toolName === 'list_directory') return `Exploring project structure`;
  if (toolName === 'finish_build') return `Finishing build`;
  if (toolName === 'report_plan') return `Drafting build plan`;
  if (toolName === 'str_replace_editor') return `Editing ${filename}`;
  if (toolName === 'install_packages') return `Installing ${d.split(' ').slice(0, 3).join(' ')}`;
  if (toolName === 'git_diff') return `Reviewing changes`;
  if (toolName === 'run_migration') return `Running database migration`;
  if (toolName === 'execute_sql') return `Querying database`;
  if (toolName === 'fetch_url') return `Fetching ${d.replace(/^https?:\/\//, '').split('/')[0]}`;
  if (toolName === 'run_tests') return `Running test suite`;
  if (toolName === 'run_lint') return `Linting codebase`;
  if (toolName === 'run_type_check') return `Type checking`;
  if (toolName === 'run_coverage') return `Measuring test coverage`;
  if (toolName === 'run_application') return `Starting application`;
  if (toolName === 'memory_read') return `Loading build context`;
  if (toolName === 'memory_write') return `Saving build context`;
  if (toolName === 'memory_search_episodes') return `Searching past builds`;
  if (toolName === 'verify_build') return `Verifying build (lint + types)`;
  if (toolName === 'find_symbol') return `Finding ${d} in codebase`;
  if (toolName === 'query_index') return `Looking up ${d} in index`;

  if (toolName === 'run_command') {
    const cmd = d.replace(/^cd\s+\S+\s*&&\s*/, '').trim();
    if (/^npm (i|install)/.test(cmd)) return `Installing dependencies`;
    if (/^npm run build/.test(cmd)) return `Building the project`;
    if (/^npm run dev/.test(cmd)) return `Starting dev server`;
    if (/^npm (run )?test/.test(cmd)) return `Running test suite`;
    if (/^npm create/.test(cmd)) return `Scaffolding project with ${cmd.match(/vite|create-react|next|remix|astro/i)?.[0] ?? 'template'}`;
    if (/^npx/.test(cmd)) return `Running ${cmd.split(' ')[1] ?? 'tool'}`;
    if (/^git init/.test(cmd)) return `Initialising git repository`;
    if (/^git add|git commit/.test(cmd)) return `Committing changes`;
    if (/^git/.test(cmd)) return `Running git command`;
    if (/^find\s/.test(cmd) && cmd.includes('-type f')) return `Scanning source files`;
    if (/^ls\s/.test(cmd) || cmd === 'ls') return `Checking directory contents`;
    if (/^mkdir/.test(cmd)) return `Creating directory structure`;
    if (/^rm\s/.test(cmd)) return `Removing files`;
    if (/^cp\s|^mv\s/.test(cmd)) return `Moving files`;
    if (/^cat\s/.test(cmd)) return `Reading file contents`;
    if (/^echo\s/.test(cmd)) return `Writing file contents`;
    if (/^chmod|^chown/.test(cmd)) return `Setting permissions`;
    if (/^curl|^wget/.test(cmd)) return `Fetching remote resource`;
    if (/^python|^python3/.test(cmd)) return `Running Python script`;
    if (/^node\s/.test(cmd)) return `Running Node.js script`;
    return `Running shell command`;
  }

  return toolName.replace(/_/g, ' ');
}

export function builderPurpose(track: string): { role: string; goal: string } {
  const norm = track.toLowerCase().replace(/[-_]/g, ' ');
  const kw = (w: string) => norm.includes(w);

  if (kw('scaffold') || kw('setup') || kw('init') || kw('bootstrap'))
    return { role: 'Project Scaffolder', goal: 'Initialises the repository structure, installs dependencies, configures build tools, and lays the foundation all other builders build on.' };
  if (kw('auth') || kw('login') || kw('session') || kw('jwt') || kw('oauth'))
    return { role: 'Auth Engineer', goal: 'Implements the full authentication surface — registration, login, password reset, session tokens, and route guards.' };
  if (kw('dashboard') || kw('layout') || kw('shell') || kw('nav') || kw('sidebar'))
    return { role: 'Layout Architect', goal: 'Builds the app shell, navigation, sidebar, and dashboard skeleton that houses every page.' };
  if (kw('api') || kw('backend') || kw('server') || kw('route') || kw('endpoint'))
    return { role: 'API Engineer', goal: 'Creates server-side routes, controllers, middleware, and wires data models to HTTP endpoints.' };
  if (kw('db') || kw('database') || kw('model') || kw('schema') || kw('migrat'))
    return { role: 'Data Engineer', goal: 'Designs and migrates the database schema, writes ORM models, and seeds initial data.' };
  if (kw('ui') || kw('component') || kw('design') || kw('style') || kw('theme') || kw('tailwind') || kw('css'))
    return { role: 'UI Specialist', goal: 'Crafts reusable components, applies the design system, and ensures visual consistency across screens.' };
  if (kw('test') || kw('spec') || kw('e2e') || kw('unit') || kw('cypress') || kw('jest') || kw('vitest'))
    return { role: 'QA Engineer', goal: 'Writes unit, integration, and end-to-end test suites to verify correctness and prevent regressions.' };
  if (kw('deploy') || kw('ci') || kw('docker') || kw('infra') || kw('devops') || kw('pipeline'))
    return { role: 'DevOps Engineer', goal: 'Configures CI/CD pipelines, Dockerfiles, environment variables, and deployment scripts.' };
  if (kw('feature') || kw('module') || kw('page') || kw('view') || kw('screen'))
    return { role: 'Feature Builder', goal: `Owns the end-to-end implementation of the "${track.replace(/[-_]/g, ' ')}" feature — components, logic, and data flow.` };
  if (kw('check') || kw('compliance') || kw('audit') || kw('report') || kw('log'))
    return { role: 'Compliance Engineer', goal: `Implements "${track.replace(/[-_]/g, ' ')}" — tracking, reporting, and audit trail functionality.` };

  const friendly = track.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { role: 'Builder', goal: `Responsible for delivering the "${friendly}" work stream — writing files, running commands, and leaving the code ready for review.` };
}

export function summariseStep(raw: string): string {
  const s = raw.replace(/^\d+\.\s*/, '').trim();
  const firstClause = s.split(/[:.]/)[0].trim();
  if (firstClause.length >= 8 && firstClause.length <= 80) return firstClause;
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

export const TRACK_BREAKDOWN_RE = /^Track breakdown:\n([\s\S]+)$/;
export const BUILDER_STEPS_RE = /^(Starting|Healing):\n([\s\S]+)$/;
export const PLAN_READY_RE = /^Plan ready — (\d+) parallel track\(s\): ([^·\n]+)(?:·\s*stack:\s*(.+))?$/;
export const LAUNCH_RE = /^Launching (\d+) parallel builders[^:]*:\s*(.+)$/;
export const STRATEGY_RE = /^\[Strategy\] Deploying (\d+) specialist agents:\n([\s\S]*)/;
export const KICKOFF_RE = /^Swarm Factory activated\.\nGoal:\s*([^\n]+)\nRepo:\s*([^\n]+?)\s*\|\s*Branch:\s*([^\n]+)$/;
export const FOLLOWUP_RE = /^Swarm Factory re-activated \(follow-up #(\d+)\)\.\nGoal:\s*([^\n]+)\nRepo:\s*([^\n]+?)\s*\|\s*Branch:\s*([^\n]+)$/;

export const APPROVAL_REQUEST_PREFIX = '__approval_request__';
export const APPROVAL_RESOLVED_PREFIX = '__approval_resolved__';

export type ApprovalPayload = {
  checkpoint: string;
  action: string;
  workflow_id: string;
};

export type ResolvedPayload = {
  checkpoint: string;
  approved: boolean;
  workflow_id: string;
};

export function parseApprovalRequest(text: string): ApprovalPayload | null {
  if (!text.startsWith(APPROVAL_REQUEST_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(APPROVAL_REQUEST_PREFIX.length)) as ApprovalPayload;
  } catch { return null; }
}

export function parseApprovalResolved(text: string): ResolvedPayload | null {
  if (!text.startsWith(APPROVAL_RESOLVED_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(APPROVAL_RESOLVED_PREFIX.length)) as ResolvedPayload;
  } catch { return null; }
}

export const CHECKPOINT_LABELS: Record<string, string> = {
  architect_plan: 'Build Plan Review',
  max_heals:      'Heal Limit Reached',
  devops:         'Deployment Approval',
};

export const CLARIFICATION_REQUEST_PREFIX = '__clarification_request__';
export const CLARIFICATION_RESOLVED_PREFIX = '__clarification_resolved__';

export type ClarificationPayload = {
  questions: string[];
  context?: string;
  workflow_id: string;
};

export function parseClarificationRequest(text: string): ClarificationPayload | null {
  if (!text.startsWith(CLARIFICATION_REQUEST_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(CLARIFICATION_REQUEST_PREFIX.length)) as ClarificationPayload;
  } catch { return null; }
}
