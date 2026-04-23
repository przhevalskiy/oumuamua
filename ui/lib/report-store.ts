export type SavedReport = {
  taskId: string;
  query: string;
  answer: string;
  createdAt: string; // ISO
  projectId?: string;
  summary?: string;        // final swarm report summary, saved on completion
  lastMessageContent?: string; // last significant message — used for HITL status detection
};

const KEY = 'gantry_reports';
const MAX = 50;

function load(): SavedReport[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(reports: SavedReport[]) {
  localStorage.setItem(KEY, JSON.stringify(reports.slice(0, MAX)));
}

export function saveReport(report: SavedReport) {
  const reports = load();
  const existing = reports.findIndex(r => r.taskId === report.taskId);
  if (existing !== -1) {
    reports[existing] = { ...reports[existing], ...report };
    save(reports);
  } else {
    save([report, ...reports]);
  }
}

export function getReport(taskId: string): SavedReport | null {
  return load().find(r => r.taskId === taskId) ?? null;
}

export function getAllReports(): SavedReport[] {
  return load();
}

export function getReportsByProject(projectId: string): SavedReport[] {
  return load().filter(r => r.projectId === projectId);
}

export function deleteReport(taskId: string) {
  save(load().filter(r => r.taskId !== taskId));
}

export function deleteReportsByProject(projectId: string) {
  save(load().filter(r => r.projectId !== projectId));
}
