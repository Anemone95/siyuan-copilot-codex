import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const dataDir = '/Users/test/Library/Application Support/SiYuan/data';
let editor;
const exports = {};
const code = ts.transpileModule(readFileSync('src/codex/active-note.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, {
    exports,
    siyuan: { config: { system: { dataDir } } },
    require: name => name === 'siyuan' ? {
        getActiveEditor: wndActive => {
            assert.equal(wndActive, false, 'resolve the active document after focus moves to chat');
            return editor;
        },
    } : require(name),
});

editor = { protyle: { notebookId: 'notebook', path: '/benchmarks.sy', block: { id: 'paragraph' } } };
const firstFile = exports.getActiveNoteFile();
assert.equal(firstFile, `${dataDir}/notebook/benchmarks.sy`);
assert.equal(exports.formatActiveNoteFile(firstFile), `当前打开的思源笔记文件：\n@"${firstFile}"`);

editor = { protyle: { notebookId: 'other', path: '/parent/nested.sy' } };
assert.equal(exports.getActiveNoteFile(), `${dataDir}/other/parent/nested.sy`);
assert.equal(firstFile, `${dataDir}/notebook/benchmarks.sy`, 'a queued snapshot keeps its original file');
editor = undefined;
assert.equal(exports.getActiveNoteFile(), null);
editor = { protyle: { notebookId: 'notebook' } };
assert.equal(exports.getActiveNoteFile(), null);
assert.equal(exports.formatActiveNoteFile(null), '');

// Execute the actual Svelte prompt builder to verify the reference reaches the outgoing prompt.
const sidebar = readFileSync('src/ai-sidebar.svelte', 'utf8');
const script = sidebar.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile('sidebar.ts', script, ts.ScriptTarget.Latest, true);
const names = new Set(['buildContextTextForPrompt', 'buildAttachmentTextForPrompt', 'buildUserPromptForCodex']);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, names.size);
const builder = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { formatActiveNoteFile: exports.formatActiveNoteFile };
vm.createContext(context);
vm.runInContext(builder, context);
const prompt = context.buildUserPromptForCodex({
    userContent: 'Summarize the current note.', activeNoteFile: firstFile,
    contextDocs: [{ id: 'manual', title: 'Manual context', content: 'extra context', type: 'doc' }],
});
assert.ok(prompt.includes(`@"${firstFile}"`));
assert.ok(prompt.includes('extra context'));
assert.equal(prompt.match(/当前打开的思源笔记文件/g).length, 1);
assert.equal(context.buildUserPromptForCodex({ userContent: 'Hello', contextDocs: [] }), 'Hello');
assert.ok(sidebar.includes('await sendMessage(nextDraft.activeNoteFile);'));
console.log('Active note context: PASS (focus transfer, switch, nested path, queue snapshot, outgoing prompt)');
