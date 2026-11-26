// Teste de fumaça multiplataforma: sobe o servidor sem abrir janela, confere
// a página, o token e a API de dados, e encerra. Não precisa do Claude Code.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4700 + Math.floor(Math.random() * 200);
const child = spawn(process.execPath, [path.join(root, 'bin', 'cli.js'), '--no-open', '--port', String(port)], { stdio: 'pipe' });
const fail = (msg) => { console.error('FALHOU:', msg); child.kill(); process.exit(1); };
setTimeout(() => fail('tempo esgotado'), 20000);

const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(base + '/api/ping')).ok) break; } catch { /* ainda subindo */ }
  await new Promise((r) => setTimeout(r, 250));
}
const html = await (await fetch(base + '/')).text();
const token = html.match(/almanaque-token" content="([^"]+)"/)?.[1];
if (!token || token === '__TOKEN__') fail('token não injetado na página');
if ((await fetch(base + '/api/data')).status !== 403) fail('API aceitou pedido sem token');
const data = await (await fetch(base + '/api/data', { headers: { 'X-Almanaque-Token': token } })).json();
if (!(data.commands?.length > 50)) fail('catálogo vazio');
for (const f of ['/app.js', '/app.css', '/icon.svg']) if (!(await fetch(base + f)).ok) fail(`arquivo ${f}`);
console.log(`ok: ${data.commands.length} comandos em ${process.platform}, Claude Code ${data.claude ? 'encontrado' : 'ausente'}`);
child.kill();
process.exit(0);
