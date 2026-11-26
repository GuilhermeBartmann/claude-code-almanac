// Verificação rápida: catálogo consistente e descoberta funcionando.
import { CATEGORIES, COMMANDS } from '../src/catalog.js';
import { discover } from '../src/discover.js';

const ids = new Set(CATEGORIES.map((c) => c.id));
const names = new Set();
let problems = 0;
for (const c of COMMANDS) {
  if (!ids.has(c.cat)) { console.error(`/${c.name}: categoria desconhecida "${c.cat}"`); problems++; }
  if (names.has(c.name)) { console.error(`/${c.name}: duplicado`); problems++; }
  names.add(c.name);
  for (const k of ['resumo', 'desc', 'uso']) if (!c[k]) { console.error(`/${c.name}: falta "${k}"`); problems++; }
}
// traduções: cada comando do catálogo precisa existir em en e es
for (const lang of ['en', 'es']) {
  const t = await import(`../src/i18n/catalog.${lang}.js`);
  for (const c of COMMANDS) {
    const x = t.COMMANDS[c.name];
    if (!x) { console.error(`[${lang}] /${c.name}: sem tradução`); problems++; continue; }
    for (const k of ['resumo', 'desc', 'uso']) if (!x[k]) { console.error(`[${lang}] /${c.name}: falta "${k}"`); problems++; }
    if ((x.exemplos || []).length !== c.exemplos.length) { console.error(`[${lang}] /${c.name}: exemplos diferentes`); problems++; }
  }
  for (const c of CATEGORIES) if (!t.CATEGORIES[c.id]) { console.error(`[${lang}] categoria ${c.id}`); problems++; }
}

const d = await discover();
const missing = d.builtins.filter((b) => !b.hidden && !names.has(b.name) && !COMMANDS.some((c) => c.aliases?.includes(b.name)));
console.log(`catálogo: ${COMMANDS.length} comandos`);
console.log(`claude: ${d.claude ? `${d.claude.version} (${d.claude.bin})` : 'não encontrado'}`);
console.log(`nativos detectados no binário: ${d.builtins.length}; instalados (skills/plugins/comandos): ${d.installed.length}`);
if (missing.length) console.log(`sem ficha no catálogo (aparecem como "Novos"): ${missing.map((m) => '/' + m.name).join(' ')}`);
process.exit(problems ? 1 : 0);
