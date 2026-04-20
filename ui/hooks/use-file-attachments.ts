import { useState, useCallback } from 'react';

export interface AttachedFile {
  name: string;
  content: string;
  size: number;
  type: string;
}

const MAX_FILE_SIZE = 100_000; // 100 KB per file
const MAX_TOTAL_SIZE = 400_000; // 400 KB total
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico',
  'pdf', 'zip', 'tar', 'gz', 'wasm', 'exe', 'bin',
  'mp4', 'mp3', 'mov', 'avi',
]);

function isLikelyText(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (BINARY_EXTS.has(ext)) return false;
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json') return true;
  if (file.type === '') return true; // unknown → try anyway
  return true;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export function buildAttachmentBlock(files: AttachedFile[]): string {
  if (!files.length) return '';
  const sections = files.map(f =>
    `--- File: ${f.name} ---\n${f.content}`
  );
  return (
    '\n\n[Attached files — treat these as part of the task context]\n\n' +
    sections.join('\n\n') +
    '\n--- End of attachments ---'
  );
}

export function useFileAttachments() {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [error, setError] = useState<string>('');

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    setError('');
    const incoming = Array.from(fileList);
    const results: AttachedFile[] = [];

    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 100 KB limit — skipped`);
        continue;
      }
      if (!isLikelyText(file)) {
        setError(`${file.name} appears to be binary — skipped`);
        continue;
      }
      try {
        const content = await readFileAsText(file);
        results.push({ name: file.name, content, size: file.size, type: file.type });
      } catch {
        setError(`Could not read ${file.name}`);
      }
    }

    setFiles(prev => {
      const merged = [...prev, ...results];
      const totalSize = merged.reduce((acc, f) => acc + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        setError('Total attachment size exceeds 400 KB — some files were dropped');
        // Keep files up to the limit
        let running = 0;
        return merged.filter(f => {
          running += f.size;
          return running <= MAX_TOTAL_SIZE;
        });
      }
      return merged;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setError('');
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setError('');
  }, []);

  return { files, error, addFiles, removeFile, clearAll };
}
