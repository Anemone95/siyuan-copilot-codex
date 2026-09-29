import { getActiveEditor } from 'siyuan';

export function getActiveNoteFile(): string | null {
    // Include the last active document when focus has moved to the chat sidebar.
    const protyle = getActiveEditor(false)?.protyle;
    const dataDir = (globalThis as any).siyuan?.config?.system?.dataDir;
    if (!dataDir || !protyle?.notebookId || !protyle.path) return null;

    const path = require('path') as typeof import('path');
    return path.join(dataDir, protyle.notebookId, protyle.path);
}

export function formatActiveNoteFile(file: string | null | undefined): string {
    return file ? `当前打开的思源笔记文件：\n@${JSON.stringify(file)}` : '';
}
