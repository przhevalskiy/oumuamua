'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import dockerfile from 'highlight.js/lib/languages/dockerfile';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('dockerfile', dockerfile);

// ── File tree helpers ─────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  relPath: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.split('/');
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const relPath = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;
      let node = level.find(n => n.name === name);
      if (!node) {
        node = { name, relPath, type: isFile ? 'file' : 'dir', children: [] };
        level.push(node);
      }
      if (!isFile) level = node.children;
    }
  }
  return root;
}

const EXT_COLOR: Record<string, string> = {
  ts: '#3b82f6', tsx: '#06b6d4', js: '#eab308', jsx: '#f97316',
  css: '#a855f7', html: '#ef4444', json: '#10b981',
  py: '#f59e0b', md: '#6b7280', yaml: '#6366f1', yml: '#6366f1',
  sh: '#22c55e', env: '#f59e0b', gitignore: '#6b7280',
  svg: '#ec4899', png: '#ec4899', jpg: '#ec4899',
};

function extColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_COLOR[ext] ?? 'var(--text-secondary)';
}

function FileIcon({ name }: { name: string }) {
  const color = extColor(name);
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6,
      borderRadius: '50%', background: color, flexShrink: 0, marginTop: 1,
    }} />
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function TreeItem({
  node, depth, selected, activeFiles, onSelect, defaultOpen,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  activeFiles: Set<string>;
  onSelect: (relPath: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);

  if (node.type === 'dir') {
    return (
      <div>
        <div
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.2rem 0.5rem', paddingLeft: `${0.5 + depth * 0.875}rem`,
            cursor: 'pointer', borderRadius: '4px', userSelect: 'none',
            fontSize: '0.78rem', color: 'var(--text-secondary)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-raised)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        >
          <span style={{ fontSize: '0.6rem', opacity: 0.5, width: 10, textAlign: 'center' }}>
            {open ? '▼' : '▶'}
          </span>
          <span style={{ fontWeight: 500 }}>{node.name}</span>
        </div>
        {open && node.children.map(child => (
          <TreeItem key={child.relPath} node={child} depth={depth + 1}
            selected={selected} activeFiles={activeFiles}
            onSelect={onSelect} defaultOpen={false} />
        ))}
      </div>
    );
  }

  const isSelected = selected === node.relPath;
  const isActive = activeFiles.has(node.relPath);

  return (
    <div
      onClick={() => onSelect(node.relPath)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.2rem 0.5rem', paddingLeft: `${0.5 + depth * 0.875}rem`,
        cursor: 'pointer', borderRadius: '4px', userSelect: 'none',
        fontSize: '0.78rem',
        background: isSelected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
        color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: isSelected ? 600 : 400,
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-raised)'; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <FileIcon name={node.name} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.name}
      </span>
      {isActive && (
        <>
          <style>{`@keyframes writePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)',
            animation: 'writePulse 1s ease-in-out infinite', flexShrink: 0,
          }} />
        </>
      )}
    </div>
  );
}

// ── Highlight.js theme (inline, dark) ────────────────────────────────────────

const HLJS_STYLE = `
.hljs{color:#abb2bf}
.hljs-comment,.hljs-quote{color:#5c6370;font-style:italic}
.hljs-doctag,.hljs-keyword,.hljs-formula{color:#c678dd}
.hljs-section,.hljs-name,.hljs-selector-tag,.hljs-deletion,.hljs-subst{color:#e06c75}
.hljs-literal{color:#56b6c2}
.hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute,.hljs-meta .hljs-string{color:#98c379}
.hljs-attr,.hljs-variable,.hljs-template-variable,.hljs-type,.hljs-selector-class,.hljs-selector-attr,.hljs-selector-pseudo,.hljs-number{color:#d19a66}
.hljs-symbol,.hljs-bullet,.hljs-link,.hljs-meta,.hljs-selector-id,.hljs-title{color:#61afef}
.hljs-built_in,.hljs-title.class_,.hljs-class .hljs-title{color:#e6c07b}
.hljs-emphasis{font-style:italic}
.hljs-strong{font-weight:700}
.hljs-link{text-decoration:underline}
`;

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', html: 'html', css: 'css', json: 'json',
  sh: 'bash', yaml: 'yaml', yml: 'yaml', md: 'markdown',
  dockerfile: 'dockerfile',
};

// ── Code viewer ───────────────────────────────────────────────────────────────

function CodeViewer({ relPath, content, isActive }: { relPath: string; content: string; isActive: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const ext = (relPath.split('/').pop() ?? relPath).split('.').pop()?.toLowerCase() ?? '';
  const lang = EXT_TO_LANG[ext];

  const highlighted = useMemo(() => {
    if (!lang) return null;
    try {
      return hljs.highlight(content, { language: lang }).value;
    } catch {
      return null;
    }
  }, [content, lang]);

  const lines = content.split('\n');

  useEffect(() => {
    if (isActive) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [content, isActive]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{HLJS_STYLE}</style>

      {/* Code body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: '1.6rem' }}>
        {/* Line numbers */}
        <div style={{
          padding: '0.75rem 0.5rem 0.75rem 0', textAlign: 'right', userSelect: 'none',
          minWidth: `${Math.max(String(lines.length).length * 0.55 + 0.75, 2)}rem`,
          borderRight: '1px solid var(--border)',
          background: 'var(--background)',
          color: 'var(--text-secondary)', opacity: 0.35, flexShrink: 0,
        }}>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code */}
        {highlighted ? (
          <pre style={{ flex: 1, margin: 0, padding: '0.75rem 1.25rem', whiteSpace: 'pre', overflow: 'unset', background: 'transparent' }}>
            <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} style={{ background: 'transparent', padding: 0 }} />
          </pre>
        ) : (
          <pre style={{ flex: 1, margin: 0, padding: '0.75rem 1.25rem', color: 'var(--text-primary)', whiteSpace: 'pre', overflow: 'unset' }}>
            {content}
          </pre>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '0.2rem 1rem',
        display: 'flex', gap: '1rem', background: 'var(--background)', flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.5, fontFamily: 'monospace' }}>
          {relPath}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.4, fontFamily: 'monospace', marginLeft: 'auto' }}>
          {lang ? lang.toUpperCase() : ext.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyPane({ repoRoot, isRunning }: { repoRoot: string; isRunning: boolean }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
      color: 'var(--text-secondary)', padding: '2rem',
    }}>
      {isRunning ? (
        <>
          <style>{`@keyframes spinSlow { to { transform: rotate(360deg); } }`}</style>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
            strokeLinecap="round" style={{ animation: 'spinSlow 2s linear infinite', opacity: 0.4 }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <p style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center' }}>
            Waiting for builders to write files…
          </p>
          <p style={{ fontSize: '0.72rem', opacity: 0.35, fontFamily: 'monospace' }}>{repoRoot}</p>
        </>
      ) : (
        <>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
            strokeLinecap="round" style={{ opacity: 0.3 }}>
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <p style={{ fontSize: '0.8rem', opacity: 0.4 }}>Select a file to view</p>
        </>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Tab {
  relPath: string;
  content: string;
}

export function FileExplorer({
  repoRoot,
  writtenPaths,
  isRunning,
}: {
  repoRoot: string;
  writtenPaths: string[];
  isRunning: boolean;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [treeWidth] = useState(200);

  const recentRel = new Set(
    writtenPaths.slice(-6).map(p =>
      p.startsWith(repoRoot) ? p.slice(repoRoot.length).replace(/^\//, '') : p
    )
  );

  // Poll file tree
  useEffect(() => {
    if (!repoRoot || repoRoot === '.') return;
    const fetchTree = async () => {
      try {
        const res = await fetch(`/api/tree?root=${encodeURIComponent(repoRoot)}`);
        if (!res.ok) return;
        const data = await res.json();
        setFiles(data.files ?? []);
      } catch { /* ignore */ }
    };
    fetchTree();
    const id = setInterval(fetchTree, isRunning ? 2500 : 8000);
    return () => clearInterval(id);
  }, [repoRoot, isRunning]);

  const fetchContent = useCallback(async (rel: string): Promise<string | null> => {
    if (!rel || !repoRoot) return null;
    const abs = `${repoRoot}/${rel}`;
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(abs)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.content ?? null;
    } catch { return null; }
  }, [repoRoot]);

  // Open or focus a tab when a file is selected from the tree
  const openTab = useCallback(async (rel: string) => {
    setActiveTab(rel);
    setTabs(prev => {
      if (prev.some(t => t.relPath === rel)) return prev;
      return [...prev, { relPath: rel, content: '' }];
    });
    const content = await fetchContent(rel);
    if (content !== null) {
      setTabs(prev => prev.map(t => t.relPath === rel ? { ...t, content } : t));
    }
  }, [fetchContent]);

  const closeTab = useCallback((rel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.relPath !== rel);
      if (activeTab === rel) {
        const idx = prev.findIndex(t => t.relPath === rel);
        const fallback = next[Math.min(idx, next.length - 1)]?.relPath ?? null;
        setActiveTab(fallback);
      }
      return next;
    });
  }, [activeTab]);

  // Auto-open most recently written file
  useEffect(() => {
    if (writtenPaths.length === 0) return;
    const last = writtenPaths[writtenPaths.length - 1];
    const rel = last.startsWith(repoRoot) ? last.slice(repoRoot.length).replace(/^\//, '') : last;
    openTab(rel);
  }, [writtenPaths.length]); // eslint-disable-line

  // Poll active tab content while running
  useEffect(() => {
    if (!activeTab || !isRunning) return;
    const id = setInterval(async () => {
      const content = await fetchContent(activeTab);
      if (content !== null) {
        setTabs(prev => prev.map(t => t.relPath === activeTab ? { ...t, content } : t));
      }
    }, 2000);
    return () => clearInterval(id);
  }, [activeTab, isRunning, fetchContent]);

  const tree = buildTree(files);
  const activeTabData = tabs.find(t => t.relPath === activeTab) ?? null;
  const isActiveFile = activeTab ? recentRel.has(activeTab) : false;

  return (
    <div style={{
      display: 'flex', height: '100%', overflow: 'hidden',
      background: 'var(--background)',
    }}>
      {/* File tree sidebar */}
      <div style={{
        width: treeWidth, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--background)',
      }}>
        {/* Tree header */}
        <div style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <p style={{
            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-secondary)', opacity: 0.5,
          }}>
            Explorer
          </p>
          {repoRoot && repoRoot !== '.' && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.4, fontFamily: 'monospace', marginTop: '0.15rem', wordBreak: 'break-all' }}>
              {repoRoot.split('/').pop()}
            </p>
          )}
        </div>

        {/* Tree body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.375rem 0' }}>
          {files.length === 0 && isRunning && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.4, padding: '0.75rem', textAlign: 'center' }}>
              Building…
            </p>
          )}
          {tree.map(node => (
            <TreeItem
              key={node.relPath}
              node={node}
              depth={0}
              selected={activeTab}
              activeFiles={recentRel}
              onSelect={openTab}
              defaultOpen={true}
            />
          ))}
        </div>

        {/* File count */}
        {files.length > 0 && (
          <div style={{ padding: '0.375rem 0.75rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.35, fontFamily: 'monospace' }}>
              {files.length} file{files.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Code viewer area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tabs.length > 0 ? (
          <>
            {/* Multi-tab bar */}
            <div style={{
              display: 'flex', alignItems: 'stretch', overflowX: 'auto', flexShrink: 0,
              borderBottom: '1px solid var(--border)', background: 'var(--background)',
              scrollbarWidth: 'none',
            }}>
              {tabs.map(tab => {
                const fileName = tab.relPath.split('/').pop() ?? tab.relPath;
                const color = extColor(fileName);
                const isActive = tab.relPath === activeTab;
                const isDirty = recentRel.has(tab.relPath);
                return (
                  <div
                    key={tab.relPath}
                    onClick={() => setActiveTab(tab.relPath)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0 0.75rem', height: '36px', flexShrink: 0,
                      cursor: 'pointer', userSelect: 'none',
                      borderRight: '1px solid var(--border)',
                      borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-raised)'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: isActive ? 600 : 400, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {fileName}
                    </span>
                    {isDirty && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, animation: 'writePulse 1s ease-in-out infinite' }} />
                    )}
                    <span
                      onClick={(e) => closeTab(tab.relPath, e)}
                      style={{
                        marginLeft: '0.15rem', width: 16, height: 16, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', borderRadius: '3px',
                        fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0,
                        opacity: 0.5,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.opacity = '1'; (e.currentTarget as HTMLSpanElement).style.background = 'var(--surface-raised)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.5'; (e.currentTarget as HTMLSpanElement).style.background = 'transparent'; }}
                    >
                      ✕
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Active file body */}
            {activeTabData ? (
              <CodeViewer relPath={activeTabData.relPath} content={activeTabData.content} isActive={isActiveFile} />
            ) : (
              <EmptyPane repoRoot={repoRoot} isRunning={isRunning} />
            )}
          </>
        ) : (
          <EmptyPane repoRoot={repoRoot} isRunning={isRunning} />
        )}
      </div>
    </div>
  );
}
