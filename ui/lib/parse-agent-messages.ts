// Parses [Role] prefixed messages into a structured swarm pipeline for the live monitor.

export type AgentRole =
  | 'Strategist' | 'Scout' | 'Agent' | 'Critic' | 'Verifier' | 'Executor' | 'Orchestrator'
  | 'Foreman' | 'Architect' | 'Builder' | 'Inspector' | 'Security' | 'DevOps';

export type AgentStatus = 'idle' | 'running' | 'done' | 'failed' | 'healing';

export type BuilderSubtask = {
  label: string;   // e.g. "project-scaffold", "auth", "layout-and-dashboard"
  status: AgentStatus;
  detail: string;  // last message for this subtask
};

export type SwarmAgentRow = {
  role: string;           // "Architect", "Builder", etc.
  status: AgentStatus;
  summary: string;        // latest one-liner status report
  detail: string;         // last raw message
  subtasks: BuilderSubtask[];  // only populated for Builder
  healCycle: number;      // how many times this agent has been re-invoked
  messageCount: number;
};

// Matches swarm tags — includes PM agent added in Phase 1
const SWARM_TAG = /^\[(PM|Foreman|Architect|Builder|Inspector|Security|DevOps)\]\s*/;

// Detects structured status reports emitted by the Foreman
// e.g. "[Foreman] Dispatching Builder (cycle 2)..."
// Also handles Phase 4 wave messages: "[Foreman] wave 1/2: launching 2 builder(s) — backend + api"
const FOREMAN_DISPATCH = /Dispatching (\w+)/i;
const FOREMAN_WAVE = /wave \d+\/\d+: launching \d+ builder/i;
const HEAL_CYCLE = /heal cycle (\d+)/i;
const BUILDER_STEP = /\[Builder\] (write_file|patch_file|create|modify|delete):\s*(.+)/i;

// Parses the tier announcement added in Phase 1/3:
// "[Foreman] Complexity tier: Standard (Tier 2) (~45 files, ~30 min, risks: auth) — ..."
const TIER_ANNOUNCE_RE = /Complexity tier:\s*(\w+)\s*\(Tier (\d+)\)(?:\s*\(([^)]+)\))?/i;

export type TierMeta = {
  label: string;
  tier: number;
  estimatedFiles?: number;
  estimatedMinutes?: number;
  riskFlags: string[];
};

export function parseTierAnnouncement(text: string): TierMeta | null {
  const m = text.match(TIER_ANNOUNCE_RE);
  if (!m) return null;
  const label = m[1];
  const tier = parseInt(m[2], 10);
  const details = m[3] ?? '';
  const filesMatch = details.match(/~(\d+)\s*files?/i);
  const minsMatch = details.match(/~(\d+)\s*min/i);
  const risksMatch = details.match(/risks?:\s*([^)]+)/i);
  return {
    label,
    tier,
    estimatedFiles: filesMatch ? parseInt(filesMatch[1], 10) : undefined,
    estimatedMinutes: minsMatch ? parseInt(minsMatch[1], 10) : undefined,
    riskFlags: risksMatch ? risksMatch[1].split(/,\s*/).map(s => s.trim()).filter(Boolean) : [],
  };
}

function statusFromBody(body: string): AgentStatus {
  const lower = body.toLowerCase();
  if (lower.includes('✗') || lower.includes('failed') || lower.includes('blocked')) return 'failed';
  if (lower.includes('✓') || lower.includes('passed') || lower.includes('done') ||
      lower.includes('complete') || lower.includes('pushed') || lower.includes('pr opened') ||
      lower.includes('plan ready') || lower.includes('clean')) return 'done';
  if (lower.includes('heal') || lower.includes('healing')) return 'healing';
  return 'running';
}

// Converts a raw Builder file path into a human-readable feature label
// e.g. "src/auth/login.tsx" → "auth"
function pathToFeatureLabel(filePath: string): string {
  const parts = filePath.replace(/^\.\//, '').split('/');
  // Use the first meaningful directory segment, or the filename stem
  if (parts.length >= 2) {
    const dir = parts[parts.length - 2];
    if (!['src', 'app', 'components', 'pages', 'lib', 'utils', '.'].includes(dir)) {
      return dir;
    }
  }
  const file = parts[parts.length - 1];
  return file.replace(/\.[^.]+$/, ''); // strip extension
}

// Extracts a concise status summary from a raw message body
function extractSummary(role: string, body: string): string {
  // Foreman dispatching messages → clean them up
  if (role === 'Foreman') {
    const dispatch = body.match(FOREMAN_DISPATCH);
    if (dispatch) return `Dispatching ${dispatch[1]}...`;
    if (body.length < 80) return body;
    return body.slice(0, 77) + '...';
  }
  // Strip tool name prefixes for cleaner display
  // e.g. "write_file: src/App.tsx" → "Writing src/App.tsx"
  const toolMatch = body.match(/^(write_file|patch_file|read_file|list_directory|run_tests|run_lint|scan_secrets|git_commit|git_push):\s*(.+)/i);
  if (toolMatch) {
    const toolLabels: Record<string, string> = {
      write_file: 'Writing', patch_file: 'Patching', read_file: 'Reading',
      list_directory: 'Scanning', run_tests: 'Running tests', run_lint: 'Linting',
      scan_secrets: 'Scanning secrets', git_commit: 'Committing', git_push: 'Pushing',
    };
    const label = toolLabels[toolMatch[1].toLowerCase()] ?? toolMatch[1];
    return `${label} ${toolMatch[2]}`;
  }
  if (body.length < 80) return body;
  return body.slice(0, 77) + '...';
}

export function buildSwarmPipeline(messages: { content: string }[]): SwarmAgentRow[] {
  // Ordered pipeline stages — PM added (Phase 1)
  const PIPELINE = ['Foreman', 'PM', 'Architect', 'Builder', 'Inspector', 'Security', 'DevOps'];

  // Initialize all rows as idle
  const rows = new Map<string, SwarmAgentRow>(
    PIPELINE.map(role => [role, {
      role,
      status: 'idle' as AgentStatus,
      summary: '',
      detail: '',
      subtasks: [],
      healCycle: 0,
      messageCount: 0,
    }])
  );

  // Track Builder subtasks by feature label
  const builderSubtasks = new Map<string, BuilderSubtask>();

  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : '';
    const match = text.match(SWARM_TAG);
    if (!match) continue;

    const role = match[1];
    const body = text.slice(match[0].length).trim();
    const row = rows.get(role);
    if (!row) continue;

    row.messageCount++;
    row.detail = body;
    row.summary = extractSummary(role, body);

    // Determine status from message content
    const msgStatus = statusFromBody(body);
    // Only upgrade status, never downgrade from done/failed unless healing
    if (row.status === 'idle' || row.status === 'running') {
      row.status = msgStatus === 'idle' ? 'running' : msgStatus;
    } else if (msgStatus === 'failed' || msgStatus === 'healing') {
      row.status = msgStatus;
    } else if (msgStatus === 'done' && row.status !== 'failed') {
      row.status = 'done';
    }

    // Re-plan: Architect goes back to running when Foreman triggers a re-plan (Phase 2)
    if (role === 'Architect' && body.toLowerCase().includes('re-planning')) {
      row.status = 'running';
      row.summary = 'Re-planning after build failure…';
    }

    // Track heal cycles for Inspector/Builder
    const healMatch = body.match(HEAL_CYCLE);
    if (healMatch) {
      row.healCycle = Math.max(row.healCycle, Number(healMatch[1]));
    }

    // Track Builder subtasks from file write operations
    if (role === 'Builder') {
      const stepMatch = body.match(BUILDER_STEP);
      if (stepMatch) {
        const filePath = stepMatch[2].trim();
        const label = pathToFeatureLabel(filePath);
        if (!builderSubtasks.has(label)) {
          builderSubtasks.set(label, { label, status: 'running', detail: body });
        } else {
          const sub = builderSubtasks.get(label)!;
          sub.detail = body;
          sub.status = msgStatus === 'idle' ? 'running' : msgStatus;
        }
      }
      // Builder done → mark all subtasks done
      if (msgStatus === 'done') {
        for (const sub of builderSubtasks.values()) {
          if (sub.status === 'running') sub.status = 'done';
        }
      }
      row.subtasks = Array.from(builderSubtasks.values());
    }

    // Foreman dispatching a role → mark that role as running
    // Also handles Phase 4 wave messages: "wave 1/2: launching 2 builder(s) — ..."
    if (role === 'Foreman') {
      const dispatch = body.match(FOREMAN_DISPATCH);
      if (dispatch) {
        const target = rows.get(dispatch[1]);
        if (target && target.status === 'idle') {
          target.status = 'running';
        }
      }
      // Wave launch → mark Builder as running
      if (FOREMAN_WAVE.test(body)) {
        const builder = rows.get('Builder');
        if (builder) builder.status = 'running';
      }
    }
  }

  return PIPELINE.map(role => rows.get(role)!);
}

// ── Legacy helpers (research/execution pipeline) ──────────────────────────────

export type AgentNode = {
  id: string;
  role: AgentRole;
  index: number;
  status: 'running' | 'done' | 'failed';
  lastAction: string;
  messages: string[];
};

const TAG_PATTERN = /^\[(Scout|Agent \d+|Critic|Verifier \d+|Executor \d+|Orchestrator|Foreman|Architect|Builder|Inspector|Security|DevOps)\]\s*/;

export function parseAgentTag(content: string): { tag: string; body: string } | null {
  const match = content.match(TAG_PATTERN);
  if (!match) return null;
  return { tag: match[1], body: content.slice(match[0].length) };
}

export function buildAgentTree(messages: { content: string }[]): AgentNode[] {
  const nodes = new Map<string, AgentNode>();
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : '';
    const parsed = parseAgentTag(text);
    if (!parsed) continue;
    const { tag, body } = parsed;
    if (!nodes.has(tag)) {
      nodes.set(tag, { id: tag, role: tag as AgentRole, index: 0, status: 'running', lastAction: body, messages: [body] });
    } else {
      const node = nodes.get(tag)!;
      node.messages.push(body);
      node.lastAction = body;
      const s = statusFromBody(body);
      if (s === 'failed') node.status = 'failed';
      else if (s === 'done') node.status = 'done';
    }
  }
  return Array.from(nodes.values());
}

export function isSwarmTask(messages: { content: string }[]): boolean {
  return messages.some(m => {
    const text = typeof m.content === 'string' ? m.content : '';
    return /^\[(Foreman|Architect|Builder|Inspector|Security|DevOps)\]/.test(text);
  });
}
