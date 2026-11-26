// Idiomas do catálogo. O português é a fonte (src/catalog.js); inglês e
// espanhol são traduções campo a campo, por nome de comando.

export const LANGS = {
  pt: { name: 'Português', answer: 'Brazilian Portuguese' },
  en: { name: 'English', answer: 'English' },
  es: { name: 'Español', answer: 'Spanish (neutral Latin American)' },
};

const EXTRA_CATS = {
  pt: { novos: 'Novos nesta versão', skills: 'Suas skills', plugins: 'Dos seus plugins', personalizados: 'Seus comandos' },
  en: { novos: 'New in this version', skills: 'Your skills', plugins: 'From your plugins', personalizados: 'Your commands' },
  es: { novos: 'Nuevos en esta versión', skills: 'Tus skills', plugins: 'De tus plugins', personalizados: 'Tus comandos' },
};

const tables = {};
for (const lang of ['en', 'es']) {
  try {
    tables[lang] = await import(`./catalog.${lang}.js`);
  } catch {
    tables[lang] = null; // tradução ausente: cai para o português
  }
}

export function pickLang(value) {
  const l = String(value || '').slice(0, 2).toLowerCase();
  return LANGS[l] ? l : 'pt';
}

/** Devolve uma cópia dos dados com textos do catálogo no idioma pedido. */
export function localize(data, lang) {
  const t = tables[lang];
  const categories = data.categories.map((c) => ({
    ...c,
    label: t?.CATEGORIES?.[c.id] || EXTRA_CATS[lang]?.[c.id] || c.label,
  }));
  if (!t) return { ...data, categories, lang };
  const commands = data.commands.map((c) => {
    const x = t.COMMANDS?.[c.name];
    return x ? { ...c, ...x } : c;
  });
  return { ...data, categories, commands, lang };
}
