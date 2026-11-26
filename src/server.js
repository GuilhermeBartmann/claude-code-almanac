// Servidor local: entrega a interface e uma API pequena para os dados e para
// as perguntas ao Claude. Escuta só em 127.0.0.1 e exige um token gerado a
// cada execução, para que outras páginas abertas no navegador não usem a API.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, MODELS } from './ask.js';
import { CATEGORIES, COMMANDS } from './catalog.js';
import { discover, findClaude } from './discover.js';
import { LANGS, localize, pickLang } from './i18n/index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, '..', 'public');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const KIND_CAT = { skill: 'skills', plugin: 'plugins', custom: 'personalizados' };

// ------------------------------------------------------------- dados ---

async function buildData(cwd) {
  const d = await discover({ cwd });
  const builtinByName = new Map(d.builtins.map((b) => [b.name, b]));
  const known = new Set();
  const commands = COMMANDS.map((c) => {
    known.add(c.name);
    (c.aliases || []).forEach((a) => known.add(a));
    const b = builtinByName.get(c.name);
    return { ...c, original: b?.description || null };
  });

  // Comandos que o binário instalado tem e o catálogo ainda não descreve.
  for (const b of d.builtins) {
    if (b.hidden || known.has(b.name)) continue;
    known.add(b.name);
    commands.push({
      name: b.name, cat: 'novos', origem: 'nativo', novo: true,
      resumo: b.description, desc: null, original: b.description,
      uso: `/${b.name}${b.args ? ' ' + b.args : ''}`,
      exemplos: [], dica: null, aliases: b.aliases, kw: '',
    });
  }

  for (const i of d.installed) {
    if (known.has(i.name)) continue;
    known.add(i.name);
    commands.push({
      name: i.name, cat: KIND_CAT[i.kind], origem: i.kind,
      plugin: i.plugin || null, escopo: i.scope || 'usuário',
      resumo: i.description, desc: null, original: i.description,
      uso: `/${i.name}${i.args ? ' ' + i.args : ''}`,
      exemplos: [], dica: null, aliases: [], kw: i.plugin || '',
      doc: true,
    });
  }

  const docs = new Map(d.installed.map((i) => [i.name, i.path]));
  return {
    app: { name: PKG.name, version: PKG.version },
    claude: d.claude,
    models: MODELS,
    categories: [
      ...CATEGORIES,
      { id: 'novos', label: 'Novos nesta versão' },
      { id: 'skills', label: 'Suas skills' },
      { id: 'plugins', label: 'Dos seus plugins' },
      { id: 'personalizados', label: 'Seus comandos' },
    ],
    commands,
    _docs: docs,
  };
}

function systemPrompt(data, cmd, lang) {
  const version = data.claude?.version || 'unknown';
  const base = [
    `You are the assistant inside "Almanaque", a guide to the slash (/) commands of Claude Code version ${version}, installed on the user's computer (${process.platform}).`,
    `Always answer in ${LANGS[lang].answer}, directly and practically, with real usage examples in code blocks when they help.`,
    'Use simple Markdown: short paragraphs, lists, **bold** and `code`. No tables.',
    'If you are not sure about a detail (a flag, a behavior), say so clearly instead of guessing.',
    'You cannot run anything on the user\'s machine; only explain.',
    'This conversation runs in a temporary folder of the almanac, not in the user\'s project: ignore the working directory, git status and environment of this session, and never mention them.',
  ];
  if (cmd) {
    base.push('', `The user is reading the page for the /${cmd.name} command. What the almanac knows about it:`);
    base.push(`- Summary: ${cmd.resumo}`);
    if (cmd.desc) base.push(`- Description: ${cmd.desc}`);
    if (cmd.original && cmd.original !== cmd.resumo) base.push(`- Original description from Claude Code: ${cmd.original}`);
    if (cmd.uso) base.push(`- Syntax: ${cmd.uso}`);
    if (cmd.aliases?.length) base.push(`- Aliases: ${cmd.aliases.map((a) => '/' + a).join(', ')}`);
    if (cmd.origem === 'plugin') base.push(`- Comes from the "${cmd.plugin}" plugin.`);
    if (cmd.origem === 'skill' && cmd.doc) base.push('- It is a skill the user installed (SKILL.md file).');
    if (cmd.origem === 'skill' && !cmd.doc) base.push('- It is a skill bundled with Claude Code.');
    if (cmd.origem === 'custom') base.push('- It is a custom command of the user (.md file in .claude/commands).');
    if (cmd.docText) base.push('', 'Contents of its definition file:', '"""', cmd.docText.slice(0, 12000), '"""');
    base.push('', 'Focus your answer on this command unless the question asks for something else.');
  } else {
    base.push('', 'The user has not picked a command yet and probably wants to find which one to use. Point to the right commands by name (with the slash) and explain why.');
    base.push('Commands available in this installation (name: summary):');
    for (const c of data.commands.slice(0, 400)) base.push(`/${c.name}: ${String(c.resumo).slice(0, 140)}`);
  }
  return base.join('\n');
}

// ----------------------------------------------------------- receita ---
// O usuário descreve uma necessidade; o Claude monta um passo a passo usando
// só o que existe nesta instalação (nativos, skills e plugins do usuário).

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentences restating the need and the approach.' },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      items: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Exact command name from the inventory, without the leading slash.' },
          why: { type: 'string', description: 'Why this command fits this step, 1-2 sentences.' },
          example: { type: 'string', description: 'The exact line to type in Claude Code, starting with the slash.' },
        },
        required: ['command', 'why', 'example'],
      },
    },
    prompt: { type: 'string', description: 'A ready-to-paste prompt for Claude Code that runs the whole flow, mentioning the commands in order.' },
    gap: { type: 'string', description: 'What the user\'s tools do not cover and what kind of skill or plugin would help. Empty string if nothing is missing.' },
  },
  required: ['summary', 'steps', 'prompt', 'gap'],
};

function planPrompt(data, lang) {
  const lines = [
    `You are the "recipe" planner inside Almanaque, a guide to Claude Code ${data.claude?.version || ''} slash commands on the user's computer.`,
    'The user describes a need. Build a short, practical sequence of steps (1 to 7) that solves it using ONLY commands from the inventory below: built-in commands, bundled skills, and the skills, plugins and custom commands this user has installed.',
    'Prefer the user\'s installed skills and plugins when they fit better than built-ins. Never invent a command that is not in the inventory. Use the exact names.',
    'Each step\'s example must be a realistic line the user would type, starting with the slash, with arguments adapted to the need.',
    `Write summary, why, prompt and gap in ${LANGS[lang].answer}.`,
    'This runs in a temporary folder: ignore the working directory and environment of this session.',
    '',
    'Inventory (name | origin | description):',
  ];
  for (const c of data.commands) {
    const origin = c.origem === 'plugin' ? `plugin ${c.plugin}` : c.doc ? (c.origem === 'custom' ? 'user command' : 'user skill') : c.origem === 'skill' ? 'bundled skill' : 'built-in';
    const text = String(c.desc || c.original || c.resumo || '').replace(/\s+/g, ' ').slice(0, 260);
    lines.push(`${c.name} | ${origin} | ${text}`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------ server ---

export async function createServer({ port, cwd, onIdle }) {
  const token = crypto.randomBytes(18).toString('base64url');

  // Presença: cada janela aberta mantém uma conexão. Quando a última fecha
  // (e ninguém reabre em alguns segundos, como num F5), avisamos quem chamou.
  const viewers = new Set();
  let idleTimer = null;
  const checkIdle = () => {
    clearTimeout(idleTimer);
    if (!onIdle || viewers.size) return;
    idleTimer = setTimeout(() => { if (!viewers.size) onIdle(); }, 8000);
  };
  let dataPromise = buildData(cwd);
  const claude = findClaude();

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('Pedido grande demais')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const host = (req.headers.host || '').toLowerCase();
    const okHost = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`].includes(host);
    if (!okHost) return send(res, 403, { error: 'Host não permitido' });

    if (url.pathname === '/api/ping') return send(res, 200, { app: 'claude-code-almanac' });

    if (url.pathname === '/api/presence') {
      // EventSource não manda cabeçalhos: aqui o token vem na URL
      if (url.searchParams.get('t') !== token) return send(res, 403, { error: 'Token inválido' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': ok\n\n');
      viewers.add(res);
      clearTimeout(idleTimer);
      const beat = setInterval(() => res.write(': .\n\n'), 25000);
      res.on('close', () => { clearInterval(beat); viewers.delete(res); checkIdle(); });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-almanaque-token'] !== token) return send(res, 403, { error: 'Token inválido' });
      try {
        if (url.pathname === '/api/data' && req.method === 'GET') {
          if (url.searchParams.get('refresh')) dataPromise = buildData(cwd);
          const { _docs, ...data } = await dataPromise;
          return send(res, 200, { ...localize(data, pickLang(url.searchParams.get('lang'))), langs: LANGS });
        }
        if (url.pathname === '/api/doc' && req.method === 'GET') {
          const data = await dataPromise;
          const file = data._docs.get(url.searchParams.get('name') || '');
          if (!file) return send(res, 404, { error: 'Sem arquivo para esse comando' });
          const text = await fsp.readFile(file, 'utf8');
          return send(res, 200, { path: file, text });
        }
        if (url.pathname === '/api/ask' && req.method === 'POST') {
          return handleAsk(req, res);
        }
        if (url.pathname === '/api/plan' && req.method === 'POST') {
          return handlePlan(req, res);
        }
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
      return send(res, 404, { error: 'Rota desconhecida' });
    }

    // arquivos estáticos
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Não encontrado', 'text/plain');
    try {
      let body = await fsp.readFile(file);
      if (rel === 'index.html') body = body.toString('utf8').replace('__TOKEN__', token);
      return send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream');
    } catch {
      return send(res, 404, 'Não encontrado', 'text/plain');
    }
  });

  async function handleAsk(req, res) {
    const body = await readBody(req);
    const prompt = String(body.question || '').trim().slice(0, 8000);
    if (!prompt) return send(res, 400, { error: 'empty question' });
    if (!claude) return send(res, 400, { error: 'Claude Code not found (`claude` is not on PATH).' });

    const lang = pickLang(body.lang);
    const raw = await dataPromise;
    const data = { ...localize(raw, lang), _docs: raw._docs };
    let cmd = body.command ? data.commands.find((c) => c.name === body.command) : null;
    if (cmd && cmd.doc && !body.resume) {
      const file = data._docs.get(cmd.name);
      const docText = file ? await fsp.readFile(file, 'utf8').catch(() => '') : '';
      cmd = { ...cmd, docText };
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    emit({ type: 'status', text: 'thinking' });

    const cancel = ask({
      claude,
      prompt,
      system: systemPrompt(data, cmd, lang),
      model: body.model,
      web: !!body.web,
      resume: body.resume,
      onEvent: (ev) => {
        emit(ev);
        if (ev.type === 'done' || ev.type === 'error') res.end();
      },
    });
    res.on('close', cancel);
  }

  async function handlePlan(req, res) {
    const body = await readBody(req);
    const need = String(body.need || '').trim().slice(0, 4000);
    if (!need) return send(res, 400, { error: 'empty request' });
    if (!claude) return send(res, 400, { error: 'Claude Code not found (`claude` is not on PATH).' });
    const lang = pickLang(body.lang);
    const data = localize(await dataPromise, lang);
    const known = new Map(data.commands.map((c) => [c.name, c]));

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    emit({ type: 'status', code: 'thinking' });

    const cancel = ask({
      claude,
      prompt: need,
      system: planPrompt(data, lang),
      model: body.model,
      web: !!body.web,
      schema: PLAN_SCHEMA,
      onEvent: (ev) => {
        if (ev.type === 'delta') return; // a receita só aparece pronta
        if (ev.type === 'done') {
          let plan = ev.structured;
          if (typeof plan === 'string') { try { plan = JSON.parse(plan); } catch { plan = null; } }
          if (!plan || !Array.isArray(plan.steps)) {
            emit({ type: 'error', message: 'Claude did not return a recipe. Try again.' });
          } else {
            plan.steps = plan.steps.map((st) => {
              const name = String(st.command || '').replace(/^\//, '').trim();
              return { ...st, command: name, known: known.has(name) };
            });
            emit({ type: 'done', plan });
          }
          return res.end();
        }
        emit(ev);
        if (ev.type === 'error') res.end();
      },
    });
    res.on('close', cancel);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  // se a janela nunca chegar a abrir, também encerra (depois de um tempo maior)
  if (onIdle) idleTimer = setTimeout(() => { if (!viewers.size) onIdle(); }, 90000);
  return server;
}
