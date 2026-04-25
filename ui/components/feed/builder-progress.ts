'use client';

import { createContext } from 'react';
import type { TaskMessage } from 'agentex/resources';

export interface BuilderProg { total: number; done: number; finished: boolean }
export type BuilderProgMap = Map<string, BuilderProg>;

export const BuilderProgressCtx = createContext<BuilderProgMap>(new Map());

export const PROGRESS_TOOLS = new Set(['write_file', 'patch_file', 'run_command', 'delete_file', 'finish_build']);

// Matches [Builder 1], [Builder (track-name)], [Builder]
export const BUILDER_TAG_RE = /^\[Builder(?:\s+(\d+)|\s+\(([^)]+)\))?\]\s*/i;

export function computeBuilderProgress(messages: TaskMessage[]): BuilderProgMap {
  const map = new Map<string, BuilderProg>();

  for (const msg of messages) {
    const c = msg.content as { type?: string; content?: unknown } | null | undefined;
    const text = (c?.type === 'text' || !c?.type) && typeof c?.content === 'string' ? c.content : '';
    if (!text) continue;

    const tagMatch = text.match(BUILDER_TAG_RE);
    if (!tagMatch) continue;

    const key = tagMatch[2] ?? tagMatch[1] ?? '0';
    const body = text.slice(tagMatch[0].length).trim();

    const stepsMatch = body.match(/^(Starting|Healing):\n([\s\S]+)$/);
    if (stepsMatch) {
      const total = stepsMatch[2].split('\n').map(l => l.trim()).filter(Boolean).length;
      const existing = map.get(key);
      map.set(key, { total, done: existing?.done ?? 0, finished: existing?.finished ?? false });
      continue;
    }

    if (body.startsWith('finish_build:')) {
      const e = map.get(key) ?? { total: 0, done: 0, finished: false };
      map.set(key, { ...e, finished: true, done: Math.max(e.done, e.total) });
      continue;
    }

    const toolMatch = body.match(/^([a-z_]+):/);
    if (toolMatch && PROGRESS_TOOLS.has(toolMatch[1])) {
      const e = map.get(key) ?? { total: 0, done: 0, finished: false };
      if (!e.finished) {
        map.set(key, { ...e, done: e.total > 0 ? Math.min(e.done + 1, e.total) : e.done + 1 });
      }
    }
  }

  return map;
}
