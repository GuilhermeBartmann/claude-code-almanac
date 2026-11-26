#!/usr/bin/env node
// claude-code-almanac: abre numa janela própria um guia pesquisável dos comandos
// "/" do Claude Code, com um assistente que responde dúvidas sobre cada um.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'));
const DEFAULT_PORT = 4729;
const WINDOW = { w: 1040, h: 700 };

// Idioma das mensagens do terminal: o mesmo do sistema (pt, es ou en).
const LANG = (() => {
  const raw = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '';
  const l = raw.slice(0, 2).toLowerCase();
  return ['pt', 'es', 'en'].includes(l) ? l : 'en';
})();

const MSG = {
  pt: {
    tagline: 'Guia pesquisável dos comandos "/" do Claude Code.',
    usage: 'Uso', options: 'Opções',
    about: 'Abre numa janela própria (modo aplicativo do Chrome, Chromium, Edge ou Brave).\nSem nenhum desses instalados, abre numa aba do navegador padrão.\nO programa fecha sozinho quando você fecha a janela.',
    optPort: 'Porta local (padrão {p})', optBrowser: 'Abre numa aba do navegador padrão, em vez de janela própria',
    optNoOpen: 'Só sobe o servidor, sem abrir nada (fica rodando até Ctrl+C)', optDesktop: 'Cria um atalho no menu de aplicativos (Linux)',
    optVersion: 'Mostra a versão', optHelp: 'Mostra esta ajuda',
    unknownOpt: 'Opção desconhecida: {a}', badPort: 'Porta inválida.',
    desktopLinuxOnly: '--desktop só funciona no Linux por enquanto.',
    installFirst: 'Instale globalmente antes de criar o atalho:\n  npm i -g claude-code-almanac   (ou pnpm add -g claude-code-almanac)',
    desktopDone: 'Atalho criado: {f}\nProcure por "Almanaque do Claude" no menu de aplicativos.',
    running: 'O almanaque já está rodando em {u}', serverFail: 'Não consegui abrir o servidor: {e}',
    openedWin: 'Almanaque do Claude aberto numa janela própria ({u}).\n  Fecha sozinho quando você fechar a janela.',
    openedTab: 'Almanaque do Claude aberto no navegador ({u}).\n  Fecha sozinho quando você fechar a aba.',
    serving: 'Almanaque do Claude rodando em  {u}\n  Ctrl+C para fechar.',
    appName: 'Almanaque do Claude', appComment: 'Guia pesquisável dos comandos / do Claude Code',
  },
  en: {
    tagline: 'A searchable guide to Claude Code "/" commands.',
    usage: 'Usage', options: 'Options',
    about: 'Opens in its own window (app mode of Chrome, Chromium, Edge or Brave).\nIf none is installed, it opens a tab in your default browser.\nIt quits on its own when you close the window.',
    optPort: 'Local port (default {p})', optBrowser: 'Open in a default browser tab instead of its own window',
    optNoOpen: 'Only start the server, open nothing (runs until Ctrl+C)', optDesktop: 'Create an app menu shortcut (Linux)',
    optVersion: 'Show the version', optHelp: 'Show this help',
    unknownOpt: 'Unknown option: {a}', badPort: 'Invalid port.',
    desktopLinuxOnly: '--desktop only works on Linux for now.',
    installFirst: 'Install it globally before creating the shortcut:\n  npm i -g claude-code-almanac   (or pnpm add -g claude-code-almanac)',
    desktopDone: 'Shortcut created: {f}\nLook for "Claude Almanac" in your app menu.',
    running: 'The almanac is already running at {u}', serverFail: 'Could not start the server: {e}',
    openedWin: 'Claude Almanac opened in its own window ({u}).\n  It quits when you close the window.',
    openedTab: 'Claude Almanac opened in your browser ({u}).\n  It quits when you close the tab.',
    serving: 'Claude Almanac running at  {u}\n  Ctrl+C to stop.',
    appName: 'Claude Almanac', appComment: 'Searchable guide to Claude Code / commands',
  },
  es: {
    tagline: 'Guía con búsqueda de los comandos "/" de Claude Code.',
    usage: 'Uso', options: 'Opciones',
    about: 'Se abre en su propia ventana (modo aplicación de Chrome, Chromium, Edge o Brave).\nSi no tienes ninguno, se abre en una pestaña del navegador predeterminado.\nSe cierra solo cuando cierras la ventana.',
    optPort: 'Puerto local (predeterminado {p})', optBrowser: 'Abrir en una pestaña del navegador en vez de su propia ventana',
    optNoOpen: 'Solo inicia el servidor, sin abrir nada (sigue hasta Ctrl+C)', optDesktop: 'Crea un acceso directo en el menú de aplicaciones (Linux)',
    optVersion: 'Muestra la versión', optHelp: 'Muestra esta ayuda',
    unknownOpt: 'Opción desconocida: {a}', badPort: 'Puerto inválido.',
    desktopLinuxOnly: '--desktop solo funciona en Linux por ahora.',
    installFirst: 'Instálalo globalmente antes de crear el acceso directo:\n  npm i -g claude-code-almanac   (o pnpm add -g claude-code-almanac)',
    desktopDone: 'Acceso directo creado: {f}\nBusca "Almanaque de Claude" en el menú de aplicaciones.',
    running: 'El almanaque ya está corriendo en {u}', serverFail: 'No se pudo iniciar el servidor: {e}',
    openedWin: 'Almanaque de Claude abierto en su propia ventana ({u}).\n  Se cierra cuando cierres la ventana.',
    openedTab: 'Almanaque de Claude abierto en el navegador ({u}).\n  Se cierra cuando cierres la pestaña.',
    serving: 'Almanaque de Claude corriendo en  {u}\n  Ctrl+C para detener.',
    appName: 'Almanaque de Claude', appComment: 'Guía con búsqueda de los comandos / de Claude Code',
  },
};
const m = (k, vars = {}, lang = LANG) => Object.entries(vars).reduce((s, [a, b]) => s.split(`{${a}}`).join(b), MSG[lang][k]);

const HELP = `
claude-code-almanac ${PKG.version}
${m('tagline')}

${m('usage')}:
  claude-code-almanac [options]

${m('about')}

${m('options')}:
  -p, --port <n>     ${m('optPort', { p: DEFAULT_PORT })}
  -b, --browser      ${m('optBrowser')}
      --no-open      ${m('optNoOpen')}
      --desktop      ${m('optDesktop')}
  -v, --version      ${m('optVersion')}
  -h, --help         ${m('optHelp')}
`;

function parseArgs(argv) {
  const o = { port: Number(process.env.ALMANAQUE_PORT) || DEFAULT_PORT, open: true, browser: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (a === '--no-open') o.open = false;
    else if (a === '-b' || a === '--browser') o.browser = true;
    else if (a === '--desktop') o.desktop = true;
    else if (a === '-p' || a === '--port') o.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) o.port = Number(a.slice(7));
    else { console.error(`${m('unknownOpt', { a })}\n${HELP}`); process.exit(2); }
  }
  if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) {
    console.error(m('badPort'));
    process.exit(2);
  }
  return o;
}

// ------------------------------------------------------------- abrir ---

function onPath(names) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      try { if (fs.statSync(p).isFile()) return p; } catch { /* segue */ }
    }
  }
  return null;
}

// Navegadores baseados em Chromium abrem um site como aplicativo (--app):
// janela sem abas nem barra de endereço.
function findAppBrowser() {
  if (process.env.ALMANAQUE_BROWSER) return process.env.ALMANAQUE_BROWSER;
  const exists = (p) => p && fs.existsSync(p) && p;
  if (process.platform === 'darwin') {
    return ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Brave Browser']
      .map((n) => `/Applications/${n}.app/Contents/MacOS/${n}`)
      .find(exists) || null;
  }
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const rel = [
      'Google\\Chrome\\Application\\chrome.exe',
      'Microsoft\\Edge\\Application\\msedge.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'Chromium\\Application\\chrome.exe',
    ];
    for (const r of rel) for (const root of roots) {
      const p = path.join(root, r);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  return onPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
    'microsoft-edge', 'microsoft-edge-stable', 'brave-browser', 'brave']);
}

function cacheDir() {
  const base = process.env.XDG_CACHE_HOME || (process.platform === 'win32'
    ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    : path.join(os.homedir(), '.cache'));
  return path.join(base, 'claude-code-almanac');
}

function openWindow(url) {
  const exe = findAppBrowser();
  if (!exe) return false;
  const profile = path.join(cacheDir(), 'janela');
  fs.mkdirSync(profile, { recursive: true });
  try {
    const child = spawn(exe, [
      `--app=${url}`,
      `--user-data-dir=${profile}`,   // perfil separado: janela independente do seu navegador
      `--window-size=${WINDOW.w},${WINDOW.h}`,
      '--class=claude-code-almanac',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
    ], { stdio: 'ignore', detached: true, windowsHide: false });
    child.on('error', () => openBrowser(url));
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } catch { /* o link já foi impresso no terminal */ }
}

function open(url, o) {
  if (!o.browser && openWindow(url)) return 'janela';
  openBrowser(url);
  return 'navegador';
}

function isOurs(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 1500 }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(s).app === 'claude-code-almanac'); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ----------------------------------------------------------- atalho ---

// Como o GNOME/KDE reconhecem a janela para mostrar o ícone certo na barra:
// no Wayland, o Chromium identifica janelas --app por "chrome-<host>__-<perfil>"
// (a porta não entra); no X11, a classe vem de --class.
function wmClass() {
  return process.env.XDG_SESSION_TYPE === 'x11' ? 'claude-code-almanac' : 'chrome-127.0.0.1__-Default';
}

function installDesktop() {
  if (process.platform !== 'linux') {
    console.error(m('desktopLinuxOnly'));
    process.exit(1);
  }
  const script = fs.realpathSync(fileURLToPath(import.meta.url));
  if (/[\\/](_npx|dlx)[\\/]/.test(script)) {
    console.error(m('installFirst'));
    process.exit(1);
  }
  const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const iconDir = path.join(data, 'icons', 'hicolor', 'scalable', 'apps');
  const appsDir = path.join(data, 'applications');
  fs.mkdirSync(iconDir, { recursive: true });
  fs.mkdirSync(appsDir, { recursive: true });
  fs.copyFileSync(path.join(HERE, '..', 'public', 'icon.svg'), path.join(iconDir, 'claude-code-almanac.svg'));
  const file = path.join(appsDir, 'claude-code-almanac.desktop');
  fs.writeFileSync(file, `[Desktop Entry]
Type=Application
Name=${m('appName', {}, 'en')}
Name[pt_BR]=${m('appName', {}, 'pt')}
Name[pt]=${m('appName', {}, 'pt')}
Name[es]=${m('appName', {}, 'es')}
Comment=${m('appComment', {}, 'en')}
Comment[pt_BR]=${m('appComment', {}, 'pt')}
Comment[pt]=${m('appComment', {}, 'pt')}
Comment[es]=${m('appComment', {}, 'es')}
Exec="${process.execPath}" "${script}"
Icon=claude-code-almanac
Terminal=false
Categories=Development;Documentation;
Keywords=claude;commands;comandos;slash;skills;help;ajuda;ayuda;almanac;almanaque;
StartupWMClass=${wmClass()}
`);
  spawn('update-desktop-database', [appsDir], { stdio: 'ignore' }).on('error', () => {});
  console.log(m('desktopDone', { f: file }));
}

// ------------------------------------------------------------- main ---

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return console.log(HELP);
  if (o.version) return console.log(PKG.version);
  if (o.desktop) return installDesktop();

  // Já tem um almanaque rodando nessa porta? Só abre outra janela nele.
  if (await isOurs(o.port)) {
    const url = `http://127.0.0.1:${o.port}/`;
    if (o.open) open(url, o);
    console.log(m('running', { u: url }));
    return;
  }

  const { createServer } = await import('../src/server.js');
  const stop = () => { server?.close(); process.exit(0); };
  let server;
  let port = o.port;
  for (let tries = 0; ; tries++) {
    try {
      // Com janela aberta, o processo acompanha a janela: fechou, encerra.
      server = await createServer({ port, cwd: process.cwd(), onIdle: o.open ? stop : null });
      break;
    } catch (e) {
      if (e.code === 'EADDRINUSE' && tries < 10) { port++; continue; }
      console.error(m('serverFail', { e: e.message }));
      process.exit(1);
    }
  }

  const url = `http://127.0.0.1:${port}/`;
  if (o.open) {
    const how = open(url, o);
    console.log(`\n  ${m(how === 'janela' ? 'openedWin' : 'openedTab', { u: url })}\n`);
  } else {
    console.log(`\n  ${m('serving', { u: url })}\n`);
  }

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
