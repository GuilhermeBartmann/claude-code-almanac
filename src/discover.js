// Descobre o que está instalado na máquina: o binário do Claude Code (e os
// comandos nativos que ele traz), as skills do usuário, os plugins ativos e
// os comandos personalizados. Tudo é lido do disco; nada sai da máquina.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const HOME = os.homedir();
export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
export const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME || (process.platform === 'win32'
    ? process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local')
    : path.join(HOME, '.cache')),
  'claude-code-almanac',
);

const IS_WIN = process.platform === 'win32';

// ------------------------------------------------------------ binário ---

function which(cmd) {
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext.toLowerCase());
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch { /* segue */ }
    }
  }
  // instalação nativa padrão
  const native = path.join(HOME, '.local', 'bin', IS_WIN ? 'claude.exe' : 'claude');
  return fs.existsSync(native) ? native : null;
}

export function findClaude() {
  const bin = which('claude');
  if (!bin) return null;
  let real = bin;
  try { real = fs.realpathSync(bin); } catch { /* mantém */ }
  // Instalação via npm no Windows: claude.cmd aponta para cli.js
  if (IS_WIN && /\.cmd$/i.test(real)) {
    const cli = path.join(path.dirname(real), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(cli)) return { bin, source: cli };
  }
  return { bin, source: real };
}

export function claudeVersion(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 15000, shell: IS_WIN }, (err, out) => {
      if (err) return resolve(null);
      const m = String(out).match(/\d+\.\d+\.\d+/);
      resolve(m ? m[0] : String(out).trim() || null);
    });
  });
}

// Os comandos nativos ficam como objetos literais no JS embutido no binário,
// por exemplo: type:"local",name:"compact",description:"Free up context…".
// Lemos em blocos para não estourar o limite de tamanho de string do V8.
const CMD_RE = /type:"(?:local|local-jsx|prompt)",name:"([a-z][a-z0-9-]*)",(?:aliases:\[([^\]]*)\],)?description:"((?:[^"\\]|\\.)*)"([^]{0,400})/g;

function unescapeJs(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1');
}

async function scanBuiltins(file) {
  const found = new Map();
  const CHUNK = 32 * 1024 * 1024;
  const OVERLAP = 4096;
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const buf = Buffer.alloc(CHUNK + OVERLAP);
    for (let pos = 0; pos < size; pos += CHUNK) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK + OVERLAP, pos);
      const text = buf.toString('latin1', 0, bytesRead);
      CMD_RE.lastIndex = 0;
      let m;
      while ((m = CMD_RE.exec(text))) {
        const [, name, aliases, desc, tail] = m;
        if (found.has(name) || !desc) continue;
        const rest = tail.split(/type:"(?:local|local-jsx|prompt)"/)[0];
        const hint = rest.match(/argumentHint:"((?:[^"\\]|\\.)*)"/);
        found.set(name, {
          name,
          description: unescapeJs(Buffer.from(desc, 'latin1').toString('utf8')),
          aliases: aliases ? [...aliases.matchAll(/"([^"]+)"/g)].map((a) => a[1]) : [],
          args: hint ? unescapeJs(hint[1]) : '',
          hidden: /isHidden:!0/.test(rest),
        });
      }
    }
  } finally {
    await fh.close();
  }
  return [...found.values()];
}

export async function builtinCommands(file) {
  if (!file) return [];
  let st;
  try { st = await fsp.stat(file); } catch { return []; }
  const key = `${st.size}-${Math.round(st.mtimeMs)}`;
  const cacheFile = path.join(CACHE_DIR, 'builtins.json');
  try {
    const c = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    if (c.file === file && c.key === key) return c.commands;
  } catch { /* sem cache */ }
  let commands = [];
  try { commands = await scanBuiltins(file); } catch { return []; }
  await fsp.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
  await fsp.writeFile(cacheFile, JSON.stringify({ file, key, commands })).catch(() => {});
  return commands;
}

// ------------------------------------------------------- frontmatter ---

// Parser mínimo de YAML para o frontmatter de SKILL.md e comandos .md:
// pares chave: valor, com suporte a blocos `>`/`|` e aspas.
export function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    if (/^[>|][+-]?\s*$/.test(val)) {
      const folded = val.startsWith('>');
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        block.push(lines[++i].trim());
      }
      val = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else {
      val = val.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
    meta[key] = val;
  }
  return { meta, body: src.slice(m[0].length) };
}

async function readMd(file) {
  try {
    return parseFrontmatter(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function listDirs(dir) {
  try {
    return (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

async function listMd(dir) {
  try {
    return (await fsp.readdir(dir)).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

function firstParagraph(body) {
  return body.split(/\n\s*\n/).map((p) => p.replace(/^#+\s*/gm, '').trim())
    .find((p) => p && !p.startsWith('```')) || '';
}

async function skillsIn(dir, extra) {
  const out = [];
  for (const name of await listDirs(dir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const md = await readMd(path.join(dir, name, 'SKILL.md'));
    if (!md) continue;
    if (md.meta['user-invocable'] === 'false') continue;
    out.push({
      name: md.meta.name || name,
      description: md.meta.description || firstParagraph(md.body).slice(0, 400),
      args: md.meta['argument-hint'] || '',
      path: path.join(dir, name, 'SKILL.md'),
      ...extra,
    });
  }
  return out;
}

async function commandsIn(dir, extra, prefix = '') {
  const out = [];
  const walk = async (d, ns) => {
    let entries = [];
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      if (e.isDirectory()) await walk(p, [...ns, e.name]);
      else if (e.name.endsWith('.md')) {
        const md = await readMd(p);
        if (!md) continue;
        const base = [...ns, e.name.replace(/\.md$/, '')].join(':');
        out.push({
          name: prefix + base,
          description: md.meta.description || firstParagraph(md.body).slice(0, 400),
          args: md.meta['argument-hint'] || '',
          path: p,
          ...extra,
        });
      }
    }
  };
  await walk(dir, []);
  return out;
}

async function plugins() {
  let installed = {};
  let enabled = {};
  try {
    installed = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'), 'utf8')).plugins || {};
  } catch { return []; }
  try {
    enabled = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, 'settings.json'), 'utf8')).enabledPlugins || {};
  } catch { /* sem settings */ }

  const out = [];
  for (const [id, installs] of Object.entries(installed)) {
    if (enabled[id] === false) continue;
    const inst = (installs || []).find((i) => i.scope === 'user') || null;
    if (!inst || !inst.installPath) continue;
    const plugin = id.split('@')[0];
    const extra = { kind: 'plugin', plugin, pluginVersion: inst.version };
    for (const s of await skillsIn(path.join(inst.installPath, 'skills'), extra)) {
      out.push({ ...s, name: `${plugin}:${s.name}` });
    }
    out.push(...await commandsIn(path.join(inst.installPath, 'commands'), extra, `${plugin}:`));
  }
  return out;
}

// --------------------------------------------------------------- tudo ---

export async function discover({ cwd = process.cwd() } = {}) {
  const claude = findClaude();
  const [version, builtins, userSkills, userCmds, projSkills, projCmds, plug] = await Promise.all([
    claude ? claudeVersion(claude.bin) : null,
    claude ? builtinCommands(claude.source) : [],
    skillsIn(path.join(CLAUDE_DIR, 'skills'), { kind: 'skill' }),
    commandsIn(path.join(CLAUDE_DIR, 'commands'), { kind: 'custom' }),
    cwd !== HOME ? skillsIn(path.join(cwd, '.claude', 'skills'), { kind: 'skill', scope: 'projeto' }) : [],
    cwd !== HOME ? commandsIn(path.join(cwd, '.claude', 'commands'), { kind: 'custom', scope: 'projeto' }) : [],
    plugins(),
  ]);
  const seen = new Set();
  const installed = [...projSkills, ...projCmds, ...userSkills, ...userCmds, ...plug]
    .filter((i) => !seen.has(i.name) && seen.add(i.name));
  return { claude: claude ? { bin: claude.bin, version } : null, builtins, installed };
}
