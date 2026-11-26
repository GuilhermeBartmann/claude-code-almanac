// Faz uma pergunta ao Claude Code em modo headless (`claude -p`) e repassa a
// resposta em pedaços conforme ela chega. Usa a conta já logada no Claude Code
// do usuário; o almanaque não guarda nem vê credenciais.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './discover.js';

export const MODELS = {
  haiku: 'Haiku (mais rápido)',
  sonnet: 'Sonnet (equilibrado)',
  opus: 'Opus (mais capaz)',
};

function command(claude) {
  // No Windows, a instalação via npm é um .cmd que chama cli.js; rodamos o
  // cli.js direto com o Node para não depender do shell (e das aspas dele).
  if (claude.source.endsWith('.js')) return [process.execPath, [claude.source]];
  return [claude.bin, []];
}

/**
 * @param {object} o
 * @param {{bin:string, source:string}} o.claude
 * @param {string} o.prompt      pergunta do usuário
 * @param {string} o.system      instruções extras de sistema
 * @param {string} o.model       haiku | sonnet | opus
 * @param {boolean} o.web        libera WebSearch/WebFetch
 * @param {string} [o.resume]    id da sessão anterior, para perguntas de seguimento
 * @param {object} [o.schema]    JSON Schema: a resposta vem estruturada em `done.structured`
 * @param {(ev:object)=>void} o.onEvent
 * @returns {() => void} função que cancela
 */
export function ask({ claude, prompt, system, model, web, resume, schema, onEvent }) {
  const [exe, pre] = command(claude);
  const args = [
    ...pre,
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', MODELS[model] ? model : 'sonnet',
    '--strict-mcp-config',          // não sobe servidores MCP: resposta mais rápida
    '--setting-sources', 'project', // ignora hooks do usuário nesta conversa
    '--disable-slash-commands',
    '--append-system-prompt', system,
  ];
  if (web) {
    args.push('--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch', 'WebFetch');
  } else {
    args.push('--tools', '');
  }
  if (resume && /^[0-9a-f-]{36}$/i.test(resume)) args.push('--resume', resume);
  if (schema) args.push('--json-schema', JSON.stringify(schema));

  const cwd = path.join(CACHE_DIR, 'conversas');
  fs.mkdirSync(cwd, { recursive: true });

  let child;
  try {
    child = spawn(exe, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    onEvent({ type: 'error', message: `Could not start Claude Code: ${e.message}` });
    return () => {};
  }

  let buf = '';
  let err = '';
  let gotText = false;
  let finished = false;
  const finish = (ev) => {
    if (finished) return;
    finished = true;
    onEvent(ev);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (o.type === 'stream_event') {
        const e = o.event || {};
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
          gotText = true;
          onEvent({ type: 'delta', text: e.delta.text });
        } else if (e.type === 'content_block_start' && e.content_block?.type === 'server_tool_use') {
          onEvent({ type: 'status', code: 'web' });
        }
      } else if (o.type === 'assistant' && !gotText) {
        // sem partial messages (versões antigas): manda o texto inteiro
        const text = (o.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
        if (text) { gotText = true; onEvent({ type: 'delta', text }); }
      } else if (o.type === 'result') {
        if (o.is_error) {
          finish({ type: 'error', message: String(o.result || 'Claude Code returned an error.') });
        } else {
          finish({ type: 'done', sessionId: o.session_id, ms: o.duration_ms, structured: o.structured_output ?? null });
        }
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => { err += c; });
  child.on('error', (e) => finish({ type: 'error', message: `Could not start Claude Code: ${e.message}` }));
  child.on('close', (code) => {
    if (code === 0) finish({ type: 'done' });
    else {
      const last = err.trim().split('\n').filter(Boolean).pop();
      finish({ type: 'error', message: last || `Claude Code exited with code ${code}.` });
    }
  });

  child.stdin.end(prompt);
  return () => {
    finished = true;
    if (!child.killed) child.kill();
  };
}
