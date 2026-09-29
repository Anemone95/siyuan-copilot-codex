import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/codex/codex-runner.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const [mode, sandbox] of [['read_only', 'read-only'], ['workspace_write', 'workspace-write']]) {
    let invocation;
    let input = '';
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: text => { input += text; }, end() {} };
    child.kill = () => {};
    const exports = {};
    const guiProcess = { platform: 'darwin', env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } };
    vm.runInNewContext(compiled, {
        exports, process: guiProcess, console, Buffer,
        require: name => name === 'child_process' ? {
            spawn: (command, args, options) => {
                invocation = { command, args: Array.from(args), options };
                return child;
            },
        } : name === 'fs' ? {
            existsSync: file => file === '/opt/homebrew/bin/node',
        } : require(name),
    });
    const events = [];
    const handle = exports.runCodexExec({
        cliPath: '/opt/homebrew/bin/codex', workingDir: '/tmp',
        mcpScriptPath: '/tmp/plugin/mcp/index.cjs', runMode: mode,
        prompt: 'test input', siyuanApiToken: 'test-secret',
        threadId: 'test-thread', onEvent: event => events.push(event),
    });
    const { args, options } = invocation;
    assert.equal(args[args.indexOf('-s') + 1], sandbox);
    assert.ok(args.includes('approval_policy="on-request"'));
    assert.ok(args.includes('approvals_reviewer="auto_review"'));
    assert.ok(!args.includes('--full-auto'));
    assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
    assert.deepEqual(args.slice(-3), ['resume', 'test-thread', '-']);
    assert.ok(!args.join(' ').includes('test-secret'));
    assert.equal(options.env.SIYUAN_API_TOKEN, 'test-secret');
    assert.equal(options.env.SIYUAN_MCP_READ_ONLY, mode === 'read_only' ? '1' : '0');
    assert.equal(options.env.PATH, '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    assert.equal(guiProcess.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin', 'preserve the host environment');
    assert.equal(input, 'test input\n');
    child.stdout.emit('data', Buffer.from('{"type":"thread.started",'));
    child.stdout.emit('data', Buffer.from('"thread_id":"test-thread"}\n'));
    child.emit('close', 0, null);
    const result = await handle.completed;
    assert.equal(result.threadId, 'test-thread');
    assert.equal(result.exitCode, 0);
    assert.equal(events.length, 1);
}
console.log('Codex CLI compatibility: PASS (GUI PATH, sandbox, approval review, resume, credentials, event stream)');
