// Almanaque do Claude Code: interface.

import { STRINGS, detectLang } from './i18n.js';

const TOKEN = document.querySelector('meta[name="almanaque-token"]').content;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const store = {
  get(k, d) { try { const v = localStorage.getItem('almanaque.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('almanaque.' + k, JSON.stringify(v)); } catch { /* sem storage */ } },
};

const state = {
  lang: detectLang(),
  data: null,
  byName: new Map(),
  cats: new Map(),
  filter: 'todos',
  query: '',
  current: null,
  favs: new Set(store.get('favoritos', [])),
  model: store.get('modelo', 'sonnet'),
  web: store.get('web', false),
  threads: new Map(),
  recipe: null,
  kbdIndex: -1,
};

// t('chave', {x: 1}) → texto no idioma atual
function t(key, vars) {
  const parts = key.split('.');
  let v = STRINGS[state.lang];
  for (const p of parts) v = v?.[p];
  if (v === undefined) { v = STRINGS.en; for (const p of parts) v = v?.[p]; }
  let s = String(v ?? key);
  if (vars) for (const [k, val] of Object.entries(vars)) s = s.split(`{${k}}`).join(val);
  return s;
}

const STARTERS = ['help', 'init', 'compact', 'clear', 'resume', 'rewind'];
const RECIPE_IDEAS = {
  pt: ['Revisar meu código e abrir um PR', 'Começar um projeto novo do zero', 'Economizar tokens numa sessão longa', 'Rodar uma tarefa todo dia sozinho'],
  en: ['Review my code and open a PR', 'Start a new project from scratch', 'Save tokens in a long session', 'Run a task every day on its own'],
  es: ['Revisar mi código y abrir un PR', 'Empezar un proyecto nuevo desde cero', 'Ahorrar tokens en una sesión larga', 'Ejecutar una tarea todos los días sola'],
};
const RECIPE_TEXT = {
  pt: {
    title: 'Monte uma receita', sub: 'Conte o que você precisa fazer. O Claude escolhe, entre os seus {n} comandos e skills, o que usar em cada etapa.',
    ph: 'Ex.: quero criar uma landing page para meu produto e publicar', build: 'Montar receita',
    loading: 'Lendo seus {n} comandos e skills…', steps: 'Passo a passo', prompt: 'Prompt pronto para o Claude Code',
    promptHint: 'Cole no Claude Code para seguir a receita inteira.', copyPrompt: 'Copiar prompt', gap: 'O que ainda falta',
    again: 'Nova receita', unknown: 'Não existe nesta instalação', or: 'ou conversa livre:',
  },
  en: {
    title: 'Build a recipe', sub: 'Tell it what you need to do. Claude picks, from your {n} commands and skills, what to use at each step.',
    ph: 'E.g.: I want to build a landing page for my product and ship it', build: 'Build recipe',
    loading: 'Reading your {n} commands and skills…', steps: 'Step by step', prompt: 'Ready-to-paste Claude Code prompt',
    promptHint: 'Paste it into Claude Code to run the whole recipe.', copyPrompt: 'Copy prompt', gap: 'What is still missing',
    again: 'New recipe', unknown: 'Not in this installation', or: 'or just chat:',
  },
  es: {
    title: 'Arma una receta', sub: 'Cuenta lo que necesitas hacer. Claude elige, entre tus {n} comandos y skills, qué usar en cada paso.',
    ph: 'Ej.: quiero crear una landing page para mi producto y publicarla', build: 'Armar receta',
    loading: 'Leyendo tus {n} comandos y skills…', steps: 'Paso a paso', prompt: 'Prompt listo para Claude Code',
    promptHint: 'Pégalo en Claude Code para seguir toda la receta.', copyPrompt: 'Copiar prompt', gap: 'Lo que aún falta',
    again: 'Nueva receta', unknown: 'No existe en esta instalación', or: 'o conversa libre:',
  },
};
const r = (key, vars) => {
  let s = (RECIPE_TEXT[state.lang] || RECIPE_TEXT.en)[key] || key;
  if (vars) for (const [k, val] of Object.entries(vars)) s = s.split(`{${k}}`).join(val);
  return s;
};

// ---------------------------------------------------------------- ícones ---

const P = {
  chat: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 4v-4H6a2 2 0 0 1-2-2z"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  sparkles: '<path d="M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  plus: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10M14 11v6M11 14h6"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.5M12 17h.01"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6"/>',
  cube: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="m3.5 7 8.5 4.5L20.5 7M12 11.5v10"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  slash: '<path d="M15 4 9 20"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  wand: '<path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
};
const CAT_ICON = {
  sessao: 'chat', contexto: 'layers', modelo: 'sparkles', agentes: 'bolt', codigo: 'code',
  extensoes: 'plus', config: 'sliders', conta: 'person', ajuda: 'help', novos: 'star',
  skills: 'book', plugins: 'cube', personalizados: 'pencil',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
const sq = (cat, size = '') => `<span class="sq ${size}" style="--cat:var(--c-${cat})">${icon(CAT_ICON[cat] || 'star')}</span>`;

// ---------------------------------------------------------------- básicos ---

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'X-Almanaque-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok && !(res.headers.get('content-type') || '').includes('event-stream')) {
    let msg = `Erro ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* corpo não-JSON */ }
    throw new Error(msg);
  }
  return res;
}

// Lê um fluxo SSE de um POST e chama onEvent para cada evento.
async function stream(path, body, signal, onEvent) {
  const res = await api(path, { method: 'POST', signal, body: JSON.stringify(body) });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)));
    }
  }
}

function toast(text) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1500);
}

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      clearTimeout(btn._t);
      const label = btn.dataset.label;
      btn.innerHTML = icon('check') + (label ? ` ${esc(t('copied'))}` : '');
      btn.classList.add('done');
      btn._t = setTimeout(() => { btn.innerHTML = icon('copy') + (label ? ` ${esc(label)}` : ''); btn.classList.remove('done'); }, 1300);
    } else toast(t('copied'));
  } catch {
    toast(t('copyFail'));
  }
}

// Rola só o painel que contém o elemento. (O método nativo do navegador também
// rolaria a janela inteira e deslocaria o app para fora do lugar.)
function reveal(el, container, smooth = false) {
  if (!el || !container) return;
  const c = container.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const pad = 8;
  let top = null;
  if (b.top < c.top + pad) top = container.scrollTop + (b.top - c.top) - pad;
  else if (b.bottom > c.bottom - pad) top = container.scrollTop + (b.bottom - c.bottom) + pad;
  if (top !== null) container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function fadeIn() {
  const b = $('#page');
  b.classList.remove('enter');
  void b.offsetWidth;
  b.classList.add('enter');
}

// ---------------------------------------------------- prévia do terminal ---
// Uma janela do Claude Code em miniatura: digita o comando e mostra o menu
// de autocompletar do "/" filtrando ao vivo, como no terminal de verdade.

function terminalHTML(c) {
  return `<div class="term-win" aria-label="${esc(t('termAria', { c: c.name }))}">
    <div class="term-bar"><i></i><i></i><i></i><span>${esc(t('termTitle'))}</span>
      <button type="button" id="term-replay" title="${esc(t('replayTitle'))}">${icon('replay')} ${esc(t('replay'))}</button></div>
    <div class="term-body">
      <div class="term-input"><span class="pr">&gt;</span><span id="term-typed"></span><span class="ghost" id="term-ghost"></span><span class="cur"></span></div>
      <div class="term-menu" id="term-menu"></div>
      <div class="term-hint" id="term-hint"></div>
    </div>
  </div>`;
}

function runTerminal(c) {
  clearTimeout(runTerminal.timer);
  const typed = $('#term-typed');
  if (!typed) return;
  const ghost = $('#term-ghost');
  const menu = $('#term-menu');
  const hint = $('#term-hint');
  const pool = state.data.commands.filter((x) => !x.novo || x.name === c.name);
  const full = '/' + c.name;
  const args = (c.uso || '').replace(/^\/\S+\s*/, '');

  const paint = (text) => {
    typed.textContent = text;
    ghost.textContent = '';
    hint.textContent = '';
    const q = text.slice(1).toLowerCase();
    const hits = pool.filter((x) => x.name.startsWith(q))
      .sort((a, b) => (a.name === c.name ? -1 : b.name === c.name ? 1 : a.name.length - b.name.length || a.name.localeCompare(b.name)))
      .slice(0, 5);
    menu.innerHTML = hits.map((x, i) => `<div class="${i === 0 ? 'on' : ''}"><b>/${esc(x.name)}</b><span>${esc(x.resumo)}</span></div>`).join('');
  };
  const finish = () => {
    paint(full);
    ghost.textContent = args ? ' ' + args : '';
    hint.textContent = t('termEnter');
  };

  if (reduceMotion()) { finish(); return; }
  let i = 1;
  paint('/');
  const step = () => {
    if (!typed.isConnected) return;
    if (i < full.length) {
      i++;
      paint(full.slice(0, i));
      runTerminal.timer = setTimeout(step, 70 + Math.random() * 60);
    } else {
      runTerminal.timer = setTimeout(finish, 650);
    }
  };
  runTerminal.timer = setTimeout(step, 450);
}

// -------------------------------------------------------------- markdown ---

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function markdown(src) {
  const lines = esc(src).split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushPara(); flushList();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushPara(); flushList(); out.push(`<h4>${inline(h[2])}</h4>`); continue; }
    const li = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)/);
    if (li) {
      flushPara();
      const tag = li[1] ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(li[2]);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (list && /^\s{2,}/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('');
}

// transforma `/comando` citado numa resposta em link para a ficha
function linkCommands(el) {
  el.querySelectorAll('code').forEach((code) => {
    if (code.closest('pre') || code.closest('a')) return;
    const m = code.textContent.match(/^\/([\w:-]+)/);
    if (m && state.byName.has(m[1])) {
      const a = document.createElement('a');
      a.href = '#/' + m[1];
      code.replaceWith(a);
      a.append(code);
    }
  });
}

// ------------------------------------------------------------------ dados ---

function originLabel(c) {
  if (c.origem === 'plugin') return t('origin.plugin', { p: c.plugin });
  if (c.origem === 'custom') return c.escopo === 'projeto' ? t('origin.customProj') : t('origin.custom');
  if (c.doc) return c.escopo === 'projeto' ? t('origin.skillProj') : t('origin.skill');
  if (c.origem === 'skill') return t('origin.bundled');
  return t('origin.native');
}

function haystack(c) {
  if (!c._h) {
    c._h = {
      name: norm(c.name),
      alias: norm((c.aliases || []).join(' ')),
      resumo: norm(c.resumo),
      kw: norm(c.kw) + ' ' + norm(state.cats.get(c.cat)?.label),
      body: norm([c.desc, c.original, c.plugin].join(' ')),
    };
  }
  return c._h;
}

function score(c, q) {
  const h = haystack(c);
  const words = q.split(/\s+/).filter(Boolean);
  const qn = q.replace(/^\//, '');
  let s = 0;
  if (h.name === qn) s += 100;
  else if (h.name.startsWith(qn)) s += 60;
  else if (h.name.includes(qn)) s += 40;
  if (h.alias.split(' ').includes(qn)) s += 50;
  for (const w0 of words) {
    const w = w0.replace(/^\//, '');
    let hit = 0;
    if (h.name.includes(w)) hit = Math.max(hit, 20);
    if (h.alias.includes(w)) hit = Math.max(hit, 18);
    if (h.resumo.includes(w)) hit = Math.max(hit, 12);
    if (h.kw.includes(w)) hit = Math.max(hit, 10);
    if (h.body.includes(w)) hit = Math.max(hit, 5);
    if (!hit) return 0;
    s += hit;
  }
  if (!c.doc) s += 2; // empate: nativos primeiro
  return s;
}

function visible() {
  const { data, filter } = state;
  let list = data.commands.filter((c) => {
    if (filter === 'nativo') return !c.doc;
    if (filter === 'instalados') return c.doc;
    if (filter === 'favoritos') return state.favs.has(c.name);
    return true;
  });
  const q = norm(state.query.trim());
  if (q) {
    list = list.map((c) => [c, score(c, q)]).filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).map(([c]) => c);
  }
  return list;
}

// ------------------------------------------------------------------ lista ---

function renderList() {
  const el = $('#list');
  const items = visible();
  state.kbdIndex = -1;

  if (!items.length) {
    const q = state.query.trim();
    el.innerHTML = q
      ? `<div class="list-empty">${esc(t('noMatch', { q }))}<br><button class="btn primary" type="button" id="ask-empty">${esc(r('build'))}</button></div>`
      : state.filter === 'favoritos'
        ? `<div class="list-empty">${esc(t('noFavs'))}</div>`
        : `<div class="list-empty">${esc(t('empty'))}</div>`;
    $('#ask-empty')?.addEventListener('click', () => recipeFromAnywhere(q));
    return;
  }

  const row = (c) => `<a class="item" role="option" href="#/${esc(c.name)}" data-name="${esc(c.name)}" aria-selected="${c.name === state.current}">
      ${sq(c.cat)}
      <div class="item-text">
        <div class="item-name">/${esc(c.name)}${c.novo ? '<span class="tag">new</span>' : ''}${state.favs.has(c.name) ? '<span class="star" aria-hidden="true">★</span>' : ''}</div>
        <div class="item-sum">${esc(c.resumo)}</div>
      </div>
    </a>`;

  if (state.query.trim()) {
    el.innerHTML = `<div class="group-h">${esc(t('results'))}<span>${items.length}</span></div>` + items.map(row).join('');
    return;
  }
  const groups = new Map();
  for (const c of items) {
    if (!groups.has(c.cat)) groups.set(c.cat, []);
    groups.get(c.cat).push(c);
  }
  const order = state.data.categories.map((c) => c.id);
  el.innerHTML = [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([cat, cs]) => `<div class="group" id="g-${cat}">
        <div class="group-h">${esc(state.cats.get(cat)?.label || cat)}<span>${cs.length}</span></div>
        ${cs.map(row).join('')}
      </div>`).join('');
}

function markSelected() {
  document.querySelectorAll('.item').forEach((a) => a.setAttribute('aria-selected', String(a.dataset.name === state.current)));
  reveal($('.item[aria-selected="true"]'), $('#list'));
}

function moveKbd(delta) {
  const items = [...document.querySelectorAll('.item')];
  if (!items.length) return;
  items[state.kbdIndex]?.classList.remove('kbd-focus');
  state.kbdIndex = Math.max(0, Math.min(items.length - 1, state.kbdIndex + delta));
  const it = items[state.kbdIndex];
  it.classList.add('kbd-focus');
  reveal(it, $('#list'));
}

function setToolbar(title, actions = '') {
  $('#tb-title').innerHTML = title;
  $('#tb-actions').innerHTML = actions;
}

// ------------------------------------------------------------------ início ---

function statsLine() {
  const { data } = state;
  const count = (f) => data.commands.filter(f).length;
  const nNative = count((c) => !c.doc);
  const nSkill = count((c) => c.doc && c.origem === 'skill');
  const nPlug = count((c) => c.origem === 'plugin');
  const nCustom = count((c) => c.origem === 'custom');
  const parts = [];
  if (nSkill) parts.push(t(nSkill === 1 ? 'skillsOne' : 'skillsMany', { n: nSkill }));
  if (nPlug) parts.push(t('plugins', { n: nPlug }));
  if (nCustom) parts.push(t(nCustom === 1 ? 'customOne' : 'customMany', { n: nCustom }));
  const v = data.claude?.version;
  let lead = v ? t('statsNative', { n: nNative, v: esc(v) }) : t('statsNoClaude', { n: nNative });
  if (parts.length) lead += t('statsMore', { list: parts.length > 1 ? parts.slice(0, -1).join(', ') + t('and') + parts.at(-1) : parts[0] });
  return lead + t('statsEnd');
}

function renderHome() {
  state.current = null;
  document.title = t('appTitle');
  setToolbar(esc(t('appTitle')));
  const { data } = state;
  const total = data.commands.length;
  const counts = new Map();
  for (const c of data.commands) counts.set(c.cat, (counts.get(c.cat) || 0) + 1);

  $('#page').innerHTML = `
    <section class="hero">
      <div class="appicon" aria-hidden="true"><span>/</span></div>
      <h1>${esc(t('heroTitle'))}</h1>
      <p>${statsLine()}</p>
    </section>

    <section class="recipe-box" id="recipe-box">
      <div class="recipe-head">
        <span class="sq md recipe-icon">${icon('wand')}</span>
        <div><h2>${esc(r('title'))}</h2><p>${esc(r('sub', { n: total }))}</p></div>
      </div>
      <form class="composer" id="recipe-form">
        <textarea id="recipe-q" rows="1" placeholder="${esc(data.claude ? r('ph') : t('needClaude'))}" ${data.claude ? '' : 'disabled'}></textarea>
        <button class="send" type="submit" id="recipe-send" title="${esc(r('build'))}" aria-label="${esc(r('build'))}" disabled>${icon('up')}</button>
      </form>
      <div class="pills ideas" id="ideas">${(RECIPE_IDEAS[state.lang] || RECIPE_IDEAS.en).map((i) => `<button type="button">${esc(i)}</button>`).join('')}</div>
      ${optsHTML(false)}
    </section>
    <div id="recipe-out"></div>

    <h2 class="section-h">${esc(t('starters'))}</h2>
    <div class="card rows">
      ${STARTERS.map((n) => state.byName.get(n)).filter(Boolean).map((c) => `
        <a href="#/${c.name}">${sq(c.cat, 'md')}
          <div class="row-main"><div class="row-title">/${esc(c.name)}</div><div class="row-sub">${esc(c.resumo)}</div></div>
          ${icon('chev', 'chev')}
        </a>`).join('')}
    </div>

    <h2 class="section-h">${esc(t('topics'))}</h2>
    <div class="tiles" id="tiles">
      ${data.categories.filter((c) => counts.get(c.id)).map((c) => `
        <button class="tile" type="button" data-cat="${c.id}">${sq(c.id, 'md')}<b>${esc(c.label)}</b><span>${counts.get(c.id)}</span></button>`).join('')}
    </div>`;

  $('#tiles').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    setFilter('todos');
    state.query = '';
    $('#q').value = '';
    renderList();
    const g = $(`#g-${b.dataset.cat}`);
    if (g) $('#list').scrollTo({ top: g.offsetTop - 2, behavior: 'smooth' });
  });

  bindRecipe();
  bindOpts();
  renderRecipe();
  fadeIn();
  $('#scroll').scrollTop = 0;
  markSelected();
  $('#app').classList.remove('reading');
}

// ----------------------------------------------------------------- receita ---
// O usuário descreve uma necessidade; o Claude monta um passo a passo usando
// os comandos e skills que existem nesta instalação.

function bindRecipe() {
  const form = $('#recipe-form');
  const ta = $('#recipe-q');
  const btn = $('#recipe-send');
  const sync = () => { btn.disabled = !state.recipe?.busy && (!ta.value.trim() || !state.data.claude); };
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; sync(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.recipe?.busy) { state.recipe.abort.abort(); return; }
    const need = ta.value.trim();
    if (!need) return;
    buildRecipe(need);
  });
  $('#ideas').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !state.data.claude) return;
    ta.value = b.textContent;
    buildRecipe(b.textContent);
  });
  if (state.recipe?.need && !ta.value) ta.value = state.recipe.need;
  sync();
}

function recipeFromAnywhere(need) {
  if (location.hash && location.hash !== '#/') location.hash = '#/';
  setTimeout(() => {
    const ta = $('#recipe-q');
    if (ta) ta.value = need;
    buildRecipe(need);
  }, 0);
}

async function buildRecipe(need) {
  if (!state.data.claude) { toast(t('noClaude')); return; }
  state.recipe?.abort?.abort();
  const rec = { need, busy: true, plan: null, error: null, abort: new AbortController(), status: 'thinking' };
  state.recipe = rec;
  renderRecipe(true);
  try {
    await stream('/api/plan', { need, lang: state.lang, model: state.model, web: state.web }, rec.abort.signal, (ev) => {
      if (ev.type === 'status') rec.status = ev.code;
      else if (ev.type === 'done') rec.plan = ev.plan;
      else if (ev.type === 'error') rec.error = ev.message;
      if (state.recipe === rec) renderRecipe();
    });
    if (!rec.plan && !rec.error) rec.error = t('noAnswer');
  } catch (e) {
    rec.error = e.name === 'AbortError' ? t('canceled') : e.message;
  } finally {
    rec.busy = false;
    if (state.recipe === rec) renderRecipe(true);
  }
}

function renderRecipe(scroll = false) {
  const out = $('#recipe-out');
  const btn = $('#recipe-send');
  if (!out) return;
  const rec = state.recipe;
  if (btn) {
    btn.innerHTML = icon(rec?.busy ? 'stop' : 'up');
    btn.classList.toggle('stop', !!rec?.busy);
    btn.title = rec?.busy ? t('stop') : r('build');
    btn.disabled = !rec?.busy && !$('#recipe-q').value.trim();
  }
  if (!rec) { out.innerHTML = ''; return; }

  if (rec.busy) {
    out.innerHTML = `<div class="recipe-loading card pad">
      <div class="typing"><i></i><i></i><i></i></div>
      <span>${esc(rec.status === 'web' ? t('searchingWeb') : r('loading', { n: state.data.commands.length }))}</span>
      <div class="skeleton"><i></i><i></i><i></i></div>
    </div>`;
  } else if (rec.error) {
    out.innerHTML = `<div class="card pad recipe-error">${icon('warn')}<p>${esc(rec.error)}</p></div>`;
  } else if (rec.plan) {
    const p = rec.plan;
    out.innerHTML = `
      <div class="recipe">
        <p class="recipe-summary">${esc(p.summary)}</p>
        <h2 class="section-h">${esc(r('steps'))}</h2>
        <ol class="steps">
          ${p.steps.map((s, i) => {
            const c = state.byName.get(s.command);
            return `<li class="step">
              <span class="step-n">${i + 1}</span>
              <div class="card step-card">
                <div class="step-top">
                  ${c ? sq(c.cat) : `<span class="sq" style="--cat:var(--c-novos)">${icon('warn')}</span>`}
                  ${c ? `<a class="step-cmd" href="#/${esc(c.name)}">/${esc(s.command)}</a>` : `<span class="step-cmd">/${esc(s.command)}</span>`}
                  <span class="badge">${esc(c ? originLabel(c) : r('unknown'))}</span>
                </div>
                <p class="step-why">${esc(s.why)}</p>
                <div class="step-ex"><code>${esc(s.example)}</code>
                  <button class="tb-btn" type="button" data-copy="${esc(s.example)}" title="${esc(t('copy'))}" aria-label="${esc(t('copy'))}">${icon('copy')}</button></div>
              </div>
            </li>`;
          }).join('')}
        </ol>
        ${p.gap ? `<div class="card pad tip recipe-gap"><span class="sq md" style="--cat:var(--c-agentes)">${icon('bulb')}</span><p><b>${esc(r('gap'))}.</b> ${esc(p.gap)}</p></div>` : ''}
        <h2 class="section-h">${esc(r('prompt'))}</h2>
        <div class="card prompt-card">
          <pre>${esc(p.prompt)}</pre>
          <div class="prompt-bar"><span>${esc(r('promptHint'))}</span>
            <button class="btn primary" type="button" id="copy-prompt" data-label="${esc(r('copyPrompt'))}">${icon('copy')} ${esc(r('copyPrompt'))}</button></div>
        </div>
      </div>`;
    out.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy, b)));
    $('#copy-prompt').addEventListener('click', (e) => copy(p.prompt, e.currentTarget));
  }
  if (scroll) reveal(out.firstElementChild, $('#scroll'), true);
}

// ------------------------------------------------------------------- ficha ---

function renderEntry(c) {
  state.current = c.name;
  document.title = `/${c.name}`;
  const fav = state.favs.has(c.name);
  const cat = state.cats.get(c.cat);
  const [ns, base] = c.name.includes(':') ? [c.name.split(':')[0] + ':', c.name.split(':').slice(1).join(':')] : ['', c.name];
  const usage = c.uso || `/${c.name}`;
  const um = usage.match(/^(\/\S+)(.*)$/);
  const size = c.name.length > 26 ? ' long' : c.name.length > 16 ? ' mid' : '';
  const related = state.data.commands.filter((x) => x.cat === c.cat && x.name !== c.name).slice(0, 6);
  const q = (k) => esc(t(k, { c: c.name }));

  setToolbar(
    `${sq(c.cat)}<span class="sub">${esc(cat?.label || c.cat)}</span><span class="cmd" hidden>/${esc(c.name)}</span>`,
    `<button class="tb-btn" type="button" id="copy-name" title="${q('copyCmd')}" aria-label="${q('copyCmd')}">${icon('copy')}</button>
     <button class="tb-btn ${fav ? 'on' : ''}" type="button" id="fav" title="${esc(t(fav ? 'unfav' : 'fav'))}" aria-pressed="${fav}">${icon('star')}</button>`,
  );

  // Sem descrição traduzida (skills instaladas): mostra a original e oferece explicar.
  const needsExplain = !c.desc && state.lang !== 'en';

  $('#page').innerHTML = `
    <header class="entry-head">
      ${sq(c.cat, 'lg')}
      <div style="min-width:0">
        <h1 class="entry-title${size}"><span class="slash">/</span>${ns ? `<span class="ns">${esc(ns)}</span><wbr>` : ''}${esc(base)}</h1>
        <p class="entry-lead">${esc(c.desc ? c.resumo : originLabel(c))}</p>
      </div>
    </header>
    <div class="badges">
      ${c.novo ? `<span class="badge new">${esc(t('newHere'))}</span>` : ''}
      ${c.desc ? `<span class="badge">${esc(originLabel(c))}</span>` : ''}
      ${(c.aliases || []).map((a) => `<span class="badge">${esc(t('alsoAs'))} <code>/${esc(a)}</code></span>`).join('')}
    </div>

    ${terminalHTML(c)}

    <h2 class="section-h">${esc(t('what'))}</h2>
    <div class="card pad">
      ${c.desc
        ? `<p class="prose">${esc(c.desc)}</p>`
        : `<p class="prose${needsExplain ? ' en' : ''}" lang="en">${esc(c.original || c.resumo)}</p>
           ${state.data.claude && needsExplain ? `<button class="btn primary" type="button" id="explain">${esc(t('explain'))}</button>` : ''}`}
    </div>

    <h2 class="section-h">${esc(t('how'))}</h2>
    <div class="card usage">
      <code>${um ? `${esc(um[1])}<span class="hint">${esc(um[2])}</span>` : esc(usage)}</code>
      <button class="tb-btn" type="button" data-copy="/${esc(c.name)}" title="${esc(t('copy'))}" aria-label="${esc(t('copy'))}">${icon('copy')}</button>
    </div>

    ${c.exemplos?.length ? `<h2 class="section-h">${esc(t('examples'))}</h2>
      <div class="card rows">${c.exemplos.map(([cmd, expl]) => `
        <div class="ex"><div class="row-main"><code>${esc(cmd)}</code><div class="row-sub">${esc(expl)}</div></div>
          <button class="tb-btn" type="button" data-copy="${esc(cmd)}" title="${esc(t('copyEx'))}" aria-label="${esc(t('copyEx'))}">${icon('copy')}</button></div>`).join('')}
      </div>` : ''}

    ${c.dica ? `<div class="card pad tip"><span class="sq md" style="--cat:var(--yellow)">${icon('bulb')}</span><p><b>${esc(t('tip'))}</b> ${esc(c.dica)}</p></div>` : ''}

    ${c.doc ? `<details class="card doc" id="doc"><summary>${icon('doc')}${esc(t('defFile'))}<code></code>${icon('chev', 'chev')}</summary><pre>${esc(t('loading'))}</pre></details>` : ''}
    ${c.desc && c.original && state.lang !== 'en' ? `<p class="footnote">${esc(t('original'))} <q lang="en">${esc(c.original)}</q></p>` : ''}

    <h2 class="section-h" style="margin-top:30px">${esc(t('ask'))}</h2>
    <div class="pills" id="pills">
      <button type="button" data-q="${q('chipWhenQ')}">${esc(t('chipWhen'))}</button>
      <button type="button" data-q="${q('chipStepQ')}">${esc(t('chipStep'))}</button>
      <button type="button" data-q="${q('chipCareQ')}">${esc(t('chipCare'))}</button>
      <button type="button" data-q="${q('chipSimilarQ')}">${esc(t('chipSimilar'))}</button>
    </div>
    <div class="thread" id="thread"></div>
    ${composerHTML(t('askPh', { c: c.name }))}

    ${related.length ? `<h2 class="section-h" style="margin-top:30px">${esc(t('alsoIn', { cat: cat?.label || '' }))}</h2>
      <div class="tiles related">${related.map((x) => `
        <a class="tile" href="#/${esc(x.name)}">${sq(x.cat, 'md')}<span class="tt"><b>/${esc(x.name)}</b><small>${esc(x.resumo)}</small></span></a>`).join('')}
      </div>` : ''}`;

  $('#copy-name').addEventListener('click', (e) => copy('/' + c.name, e.currentTarget));
  $('#page').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy, b)));
  $('#term-replay').addEventListener('click', () => runTerminal(c));
  $('#fav').addEventListener('click', () => toggleFav(c));
  $('#pills').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (b) send(c.name, b.dataset.q);
  });
  $('#explain')?.addEventListener('click', () => send(c.name, t('explainQ', { c: c.name })));
  $('#doc')?.addEventListener('toggle', async (e) => {
    const pre = e.target.querySelector('pre');
    if (!e.target.open || pre.dataset.loaded) return;
    try {
      const res = await (await api('/api/doc?name=' + encodeURIComponent(c.name))).json();
      pre.textContent = res.text;
      pre.dataset.loaded = '1';
      const code = e.target.querySelector('summary code');
      code.textContent = res.path;
      code.title = res.path;
    } catch (err) { pre.textContent = err.message; }
  });

  bindComposer(c.name);
  bindOpts();
  renderThread(c.name);
  runTerminal(c);
  fadeIn();
  $('#scroll').scrollTop = 0;
  markSelected();
  $('#app').classList.add('reading');
}

function toggleFav(c) {
  if (state.favs.has(c.name)) state.favs.delete(c.name); else state.favs.add(c.name);
  store.set('favoritos', [...state.favs]);
  const on = state.favs.has(c.name);
  const b = $('#fav');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.title = t(on ? 'unfav' : 'fav');
  if (on) b.querySelector('svg').classList.add('bump');
  toast(t(on ? 'favAdded' : 'favRemoved'));
  renderList();
  markSelected();
}

// ---------------------------------------------------------------- conversa ---

function optsHTML(withReset) {
  const opts = Object.keys(state.data.models).map((k) => `<option value="${k}" ${k === state.model ? 'selected' : ''}>${esc(t('models.' + k))}</option>`).join('');
  return `<div class="composer-opts">
      <label class="popup" title="${esc(t('modelTitle'))}"><select class="model-select" aria-label="${esc(t('modelTitle'))}">${opts}</select></label>
      <label class="switch" title="${esc(t('webTitle'))}">
        <input type="checkbox" class="web-toggle" ${state.web ? 'checked' : ''}><span class="track"></span>${esc(t('web'))}
      </label>
      <span class="grow"></span>
      ${withReset ? `<button class="linkbtn" type="button" id="reset" hidden>${esc(t('newChat'))}</button>` : ''}
    </div>`;
}

function bindOpts() {
  document.querySelectorAll('.model-select').forEach((s) => s.addEventListener('change', (e) => {
    state.model = e.target.value; store.set('modelo', state.model);
  }));
  document.querySelectorAll('.web-toggle').forEach((s) => s.addEventListener('change', (e) => {
    state.web = e.target.checked; store.set('web', state.web);
  }));
}

function composerHTML(placeholder) {
  const on = !!state.data.claude;
  return `<form class="composer" id="composer">
      <textarea id="composer-q" rows="1" placeholder="${esc(on ? placeholder : t('needClaude'))}" ${on ? '' : 'disabled'}></textarea>
      <button class="send" type="submit" id="send" title="${esc(t('send'))}" aria-label="${esc(t('send'))}" disabled>${icon('up')}</button>
    </form>
    ${optsHTML(true)}`;
}

function bindComposer(key) {
  const form = $('#composer');
  const ta = $('#composer-q');
  const sendBtn = $('#send');
  const sync = () => {
    const th = state.threads.get(key);
    sendBtn.disabled = !th?.busy && (!ta.value.trim() || !state.data.claude);
  };
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    sync();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  $('#reset')?.addEventListener('click', () => {
    state.threads.get(key)?.abort?.abort();
    state.threads.delete(key);
    renderThread(key);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const th = state.threads.get(key);
    if (th?.busy) { th.abort.abort(); return; }
    const q = ta.value.trim();
    if (!q) return;
    ta.value = '';
    ta.style.height = '';
    send(key, q);
  });
  sync();
}

function thread(key) {
  if (!state.threads.has(key)) state.threads.set(key, { msgs: [], sessionId: null, busy: false, abort: null });
  return state.threads.get(key);
}

const isOpen = (key) => state.current === key;

function renderThread(key) {
  const el = $('#thread');
  if (!el || !isOpen(key)) return;
  el.innerHTML = '';
  for (const m of state.threads.get(key)?.msgs || []) el.append(msgNode(m));
  updateComposer(key);
}

function msgNode(m) {
  const n = document.createElement('div');
  if (m.role === 'user') {
    n.className = 'bubble me';
    n.textContent = m.text;
  } else {
    n.className = 'bubble ai' + (m.error ? ' error' : '');
    n.innerHTML = '<div class="md"></div>';
    paintAI(n, m);
  }
  m.node = n;
  return n;
}

function paintAI(n, m) {
  const md = n.querySelector('.md');
  if (!m.text && m.status) md.innerHTML = `<span class="typing" aria-label="${esc(t('thinking'))}"><i></i><i></i><i></i></span>${m.status === 'web' ? `<span class="status-text">${esc(t('searchingWeb'))}</span>` : ''}`;
  else if (m.error) md.innerHTML = `<p>${esc(m.text)}</p>`;
  else { md.innerHTML = markdown(m.text); linkCommands(md); }
}

function updateComposer(key) {
  if (!isOpen(key)) return;
  const th = state.threads.get(key);
  const btn = $('#send');
  if (!btn) return;
  btn.innerHTML = icon(th?.busy ? 'stop' : 'up');
  btn.classList.toggle('stop', !!th?.busy);
  btn.title = t(th?.busy ? 'stop' : 'send');
  btn.disabled = !th?.busy && !$('#composer-q').value.trim();
  const reset = $('#reset');
  if (reset) reset.hidden = !(th?.msgs.length) || !!th?.busy;
}

async function send(key, question) {
  if (!state.data.claude) { toast(t('noClaude')); return; }
  const th = thread(key);
  if (th.busy) return;
  const user = { role: 'user', text: question };
  const ai = { role: 'ai', text: '', status: 'thinking' };
  th.msgs.push(user, ai);
  th.busy = true;
  th.abort = new AbortController();

  if (isOpen(key)) {
    $('#thread').append(msgNode(user), msgNode(ai));
    reveal(ai.node, $('#scroll'), true);
  }
  updateComposer(key);

  let raf = 0;
  const repaint = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (ai.node?.isConnected) paintAI(ai.node, ai); });
  };

  try {
    await stream('/api/ask', {
      question, command: key, model: state.model, web: state.web, resume: th.sessionId, lang: state.lang,
    }, th.abort.signal, (ev) => {
      if (ev.type === 'delta') { ai.text += ev.text; ai.status = null; }
      else if (ev.type === 'status') ai.status = ev.code;
      else if (ev.type === 'done') { if (ev.sessionId) th.sessionId = ev.sessionId; }
      else if (ev.type === 'error') { ai.error = true; ai.text = ev.message; }
      repaint();
    });
    if (!ai.text) { ai.error = true; ai.text = t('noAnswer'); }
  } catch (e) {
    if (e.name === 'AbortError') {
      if (!ai.text) { ai.error = true; ai.text = t('canceled'); } else ai.text += `\n\n*${t('interrupted')}*`;
    } else { ai.error = true; ai.text = e.message; }
  } finally {
    th.busy = false;
    ai.status = null;
    if (ai.node?.isConnected) {
      ai.node.classList.toggle('error', !!ai.error);
      paintAI(ai.node, ai);
    }
    updateComposer(key);
  }
}

// --------------------------------------------------------------- Spotlight ---

const spot = { rows: [], index: 0, last: null };

function openSpot() {
  spot.last = document.activeElement;
  $('#spot').hidden = false;
  const input = $('#spot-q');
  input.value = '';
  renderSpot();
  input.focus();
}

function closeSpot() {
  $('#spot').hidden = true;
  spot.last?.focus?.();
}

function renderSpot() {
  const raw = $('#spot-q').value.trim();
  const q = norm(raw);
  const items = !q
    ? STARTERS.map((n) => state.byName.get(n)).filter(Boolean)
    : state.data.commands.map((c) => [c, score(c, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
  spot.rows = [...items, ...(raw && state.data.claude ? [{ recipe: raw }] : [])];
  spot.index = 0;
  $('#spot-list').innerHTML = spot.rows.map((c, i) => c.recipe
    ? `<div class="spot-row ask" data-i="${i}"><span class="sq">${icon('wand')}</span><span class="tt"><b>${esc(r('build'))}</b><small>“${esc(c.recipe)}”</small></span><em>${esc(t('assistant'))}</em></div>`
    : `<div class="spot-row" data-i="${i}">${sq(c.cat)}<span class="tt"><b>/${esc(c.name)}</b><small>${esc(c.resumo)}</small></span><em>${esc(state.cats.get(c.cat)?.label || '')}</em></div>`).join('');
  markSpot();
}

function markSpot() {
  document.querySelectorAll('.spot-row').forEach((x) => x.classList.toggle('on', Number(x.dataset.i) === spot.index));
  reveal($(`.spot-row[data-i="${spot.index}"]`), $('#spot-list'));
}

function pickSpot(i) {
  const row = spot.rows[i];
  if (!row) return;
  closeSpot();
  if (row.recipe) recipeFromAnywhere(row.recipe);
  else location.hash = '#/' + row.name;
}

function bindSpot() {
  const input = $('#spot-q');
  input.addEventListener('input', renderSpot);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); spot.index = Math.min(spot.rows.length - 1, spot.index + 1); markSpot(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spot.index = Math.max(0, spot.index - 1); markSpot(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickSpot(spot.index); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSpot(); }
  });
  $('#spot-list').addEventListener('mousemove', (e) => {
    const x = e.target.closest('.spot-row');
    if (x && Number(x.dataset.i) !== spot.index) { spot.index = Number(x.dataset.i); markSpot(); }
  });
  $('#spot-list').addEventListener('click', (e) => {
    const x = e.target.closest('.spot-row');
    if (x) pickSpot(Number(x.dataset.i));
  });
  $('#spot').addEventListener('mousedown', (e) => { if (e.target.id === 'spot') closeSpot(); });
  $('#spot-btn').addEventListener('click', openSpot);
}

// ------------------------------------------------------------------ idioma ---

function applyStatic() {
  document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : state.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  const v = state.data?.claude?.version;
  if (state.data) {
    $('#side-foot').innerHTML = state.data.claude
      ? `<span class="dot"></span>Claude Code ${esc(v || '')}<kbd>Ctrl K</kbd>`
      : `<span class="dot off"></span>${esc(t('footMissing'))}<kbd>Ctrl K</kbd>`;
  }
  document.querySelectorAll('#lang-menu button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === state.lang)));
}

async function loadData() {
  const data = await (await api('/api/data?lang=' + state.lang)).json();
  state.data = data;
  state.cats = new Map(data.categories.map((c) => [c.id, c]));
  state.byName = new Map(data.commands.map((c) => [c.name, c]));
}

async function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  try { localStorage.setItem('almanaque.idioma', lang); } catch { /* sem storage */ }
  await loadData();
  applyStatic();
  renderList();
  route();
}

function bindLangMenu() {
  const btn = $('#lang-btn');
  const menu = $('#lang-menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('[aria-checked="true"]')?.focus();
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    close();
    setLang(b.dataset.lang);
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { close(); btn.focus(); }
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
}

// ------------------------------------------------------------------- rotas ---

function route() {
  const name = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const c = name && state.byName.get(name);
  if (c) renderEntry(c);
  else renderHome();
}

function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('#filters button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
}

function bindGlobal() {
  const q = $('#q');
  q.addEventListener('input', () => { state.query = q.value; renderList(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveKbd(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveKbd(-1); }
    else if (e.key === 'Enter') {
      const it = [...document.querySelectorAll('.item')][Math.max(0, state.kbdIndex)];
      if (it) location.hash = '#/' + it.dataset.name;
    } else if (e.key === 'Escape') {
      q.value = ''; state.query = ''; renderList(); markSelected();
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if ($('#spot').hidden) openSpot(); else closeSpot();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      q.focus();
      q.select();
    }
  });
  bindSpot();
  bindLangMenu();

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    setFilter(b.dataset.f);
    renderList();
    markSelected();
  });

  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('almanaque.tema', root.dataset.theme); } catch { /* sem storage */ }
  });

  $('#back').addEventListener('click', () => { location.hash = '#/'; });

  // Título grande que recolhe: depois que o nome some do topo, ele aparece na barra.
  $('#scroll').addEventListener('scroll', (e) => {
    const top = e.target.scrollTop;
    $('#toolbar').classList.toggle('scrolled', top > 4);
    const title = $('.entry-title');
    const cmd = $('#tb-title .cmd');
    if (!title || !cmd) return;
    const gone = title.getBoundingClientRect().bottom < e.target.getBoundingClientRect().top + 46;
    cmd.hidden = !gone;
    $('#tb-title .sub').hidden = gone;
  }, { passive: true });

  window.addEventListener('hashchange', route);
}

async function boot() {
  applyStatic();
  bindGlobal();
  // avisa o servidor que esta janela está aberta (ele fecha quando todas fecham)
  try { new EventSource('/api/presence?t=' + encodeURIComponent(TOKEN)); } catch { /* sem SSE */ }
  try {
    await loadData();
  } catch (e) {
    $('#page').innerHTML = `<section class="hero"><h1>${esc(t('loadFail'))}</h1><p>${esc(e.message)}. ${t('loadFailHint')}</p></section>`;
    return;
  }
  applyStatic();
  renderList();
  route();
}

boot();
