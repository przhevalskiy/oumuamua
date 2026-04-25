'use client';

export const TOOL_LABELS: Record<string, string> = {
  search_web: 'Searching', navigate: 'Navigating', extract: 'Extracting',
  finish: 'Synthesizing', click_element: 'Clicking',
  list_directory: 'Exploring project structure', read_file: 'Reading',
  write_file: 'Writing', patch_file: 'Patching',
  delete_file: 'Deleting', run_command: 'Running command',
  finish_build: 'Build complete', report_plan: 'Reporting plan',
  verify_build: 'Verifying build', find_symbol: 'Finding symbol',
  query_index: 'Looking up in index', run_coverage: 'Measuring coverage',
  str_replace_editor: 'Editing', install_packages: 'Installing packages',
  git_diff: 'Checking diff', run_migration: 'Running migration',
  execute_sql: 'Querying database', fetch_url: 'Fetching URL',
  run_tests: 'Running tests', run_lint: 'Linting',
  run_type_check: 'Type checking', run_application: 'Starting application',
  memory_read: 'Loading build context', memory_write: 'Saving build context',
  memory_search_episodes: 'Searching past builds',
};

export function ToolIcon({ name, size = 13, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const s = size;
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { flexShrink: 0 } };
  switch (name) {
    case 'list_directory':
      return <svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case 'read_file': case 'extract':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case 'write_file': case 'str_replace_editor': case 'patch_file':
      return <svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case 'delete_file':
      return <svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>;
    case 'run_command':
      return <svg {...props}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case 'search_web': case 'run_lint': case 'find_symbol':
      return <svg {...props}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case 'navigate': case 'fetch_url':
      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    case 'finish': case 'finish_build':
      return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'verify_build': case 'run_type_check': case 'run_coverage':
      return <svg {...props}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'query_index':
      return <svg {...props}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
    case 'install_packages':
      return <svg {...props}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>;
    case 'git_diff':
      return <svg {...props}><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>;
    case 'run_migration': case 'execute_sql':
      return <svg {...props}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
    case 'run_tests':
      return <svg {...props}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'run_application':
      return <svg {...props}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case 'memory_read': case 'memory_write': case 'memory_search_episodes':
      return <svg {...props}><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'report_plan':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case 'click_element':
      return <svg {...props}><path d="M5 3l14 9-7 1-3 7z"/></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>;
  }
}
