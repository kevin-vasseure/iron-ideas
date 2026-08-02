#!/usr/bin/env node
/**
 * Iron Ideas — compilateur de fiches. Zéro dépendance.
 *
 *   node build.mjs           compile cards/*.md -> app/cards.js
 *   node build.mjs --watch   recompile à chaque modif + sert http://localhost:4321
 *
 * Les fichiers de cards/ sont de simples bacs : leur nom n'a aucune valeur
 * sémantique. Toute l'organisation passe par les TAGS.
 *
 *   ---
 *   tags: politique, rhétorique          # tags hérités par toutes les fiches du fichier
 *   ---
 *
 *   ## Titre de la fiche
 *   type: concept
 *   tags: auteur:gramsci, histoire       # tags propres à cette fiche (s'ajoutent)
 *
 *   Recto : la question, le concept à restituer.
 *
 *   ---
 *
 *   Verso : l'explication, le contre-argument, la réponse.
 *
 * Le titre sert d'identifiant (pour la progression) : il doit être unique.
 * Un tag « ns:valeur » est regroupé sous le namespace « ns » dans l'interface.
 * Dans le corps, « [[Titre exact]] » lie vers une autre fiche, tous fichiers
 * confondus ; « [[Titre exact|texte affiché]] » quand la phrase l'exige.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, resolve, sep } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = join(ROOT, 'cards');
const APP_DIR = join(ROOT, 'app');
const OUT = join(APP_DIR, 'cards.js');
const PORT = 4321;

/** Clés reconnues juste après un `## titre`. */
const CARD_META = /^(type|tags|source|note)\s*:\s*(.*)$/i;
/** Une ligne faite uniquement de `---` : frontmatter ou séparateur recto/verso. */
const RULE = /^\s*---\s*$/;
/**
 * Lien vers une autre fiche, dans le corps : `[[Titre exact]]`, ou
 * `[[Titre exact|texte affiché]]` quand la phrase demande un autre libellé
 * (accord, inflexion). La cible est résolue par slug du titre, à la compilation.
 */
const CARD_LINK = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Normalise un tag : minuscules, espaces resserrés, accents conservés. */
const normTag = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

const splitTags = (s) => (s || '').split(',').map(normTag).filter(Boolean);

/* ------------------------------------------------------------------ parsing */

function parseFile(filename, text) {
  const lines = text.split(/\r?\n/);
  const head = {};
  let i = 0;

  // frontmatter : tags par défaut du fichier
  if (RULE.test(lines[0] ?? '')) {
    for (i = 1; i < lines.length && !RULE.test(lines[i]); i++) {
      const m = lines[i].match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
      if (m) head[m[1].toLowerCase()] = m[2].trim();
    }
    i++; // saute le --- de fermeture
  }

  const inherited = splitTags(head.tags);
  const cards = [];
  let cur = null;

  const flush = () => {
    const c = cur;
    cur = null;
    if (!c) return;
    const cut = c.body.findIndex((l) => RULE.test(l));
    const recto = (cut < 0 ? c.body : c.body.slice(0, cut)).join('\n').trim();
    const verso = cut < 0 ? '' : c.body.slice(cut + 1).join('\n').trim();
    if (!recto && !verso) return;
    if (!verso) console.warn(`  ⚠ verso manquant : « ${c.title} » (${filename})`);
    cards.push({
      id: slug(c.title),
      file: filename,
      title: c.title,
      type: slug(c.meta.type || 'concept'),
      tags: [...new Set([...inherited, ...splitTags(c.meta.tags)])].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
      source: c.meta.source || '',
      recto,
      verso,
    });
  };

  for (; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(.+)$/);
    if (h) {
      flush();
      cur = { title: h[1].trim(), meta: {}, body: [], inHead: true };
      continue;
    }
    if (!cur) continue;
    if (cur.inHead) {
      if (!lines[i].trim()) continue;
      const m = lines[i].match(CARD_META);
      if (m) {
        cur.meta[m[1].toLowerCase()] = m[2].trim();
        continue;
      }
      cur.inHead = false;
    }
    cur.body.push(lines[i]);
  }
  flush();
  return cards;
}

/* -------------------------------------------------------------------- build */

async function build() {
  const files = (await readdir(CARDS_DIR)).filter((f) => f.endsWith('.md')).sort();
  const all = [];
  for (const f of files) {
    all.push(...parseFile(f, await readFile(join(CARDS_DIR, f), 'utf8')));
  }

  // Le titre est l'identifiant : on désambiguïse les doublons plutôt que de
  // laisser deux fiches partager la même progression.
  const used = new Map();
  for (const c of all) {
    const n = (used.get(c.id) || 0) + 1;
    used.set(c.id, n);
    if (n > 1) {
      console.warn(`  ⚠ titre en double : « ${c.title} » (${c.file}) → id « ${c.id}-${n} »`);
      c.id = `${c.id}-${n}`;
    }
  }

  // Les `[[Titre]]` sont résolus ici, une fois toutes les fiches connues : un
  // lien peut donc pointer vers n'importe quel fichier. L'app ne voit plus que
  // des identifiants, jamais des titres — un lien mort est signalé à la
  // compilation et retombe en texte simple plutôt que d'afficher `[[…]]`.
  const ids = new Set(all.map((c) => c.id));
  let links = 0;
  const resolveLinks = (text, card) =>
    text.replace(CARD_LINK, (_, target, label) => {
      const title = target.trim();
      const shown = (label ?? title).trim();
      const id = slug(title);
      if (id === card.id) {
        console.warn(`  ⚠ lien vers elle-même : « ${card.title} » (${card.file})`);
        return shown;
      }
      if (!ids.has(id)) {
        console.warn(`  ⚠ lien mort : « ${title} » cité par « ${card.title} » (${card.file})`);
        return shown;
      }
      links++;
      return `[[${id}|${shown}]]`;
    });
  for (const c of all) {
    c.recto = resolveLinks(c.recto, c);
    c.verso = resolveLinks(c.verso, c);
  }

  await writeFile(
    OUT,
    `// Généré par build.mjs — ne pas éditer à la main. Source : cards/*.md\n` +
      `window.CARDS = ${JSON.stringify(all, null, 1)};\n`,
  );
  const tags = new Set(all.flatMap((c) => c.tags));
  console.log(
    `✓ ${all.length} fiches · ${tags.size} tags · ${links} liens · ${files.length} fichiers → app/cards.js`,
  );
}

/* -------------------------------------------------------------------- serve */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // Sans ce type, le navigateur rejette le manifeste et l'app n'est pas installable.
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function serve() {
  createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(APP_DIR, '.' + (p === '/' ? '/index.html' : p));
    if (target !== APP_DIR && !target.startsWith(APP_DIR + sep)) {
      res.writeHead(403).end('403');
      return;
    }
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
    }
  }).listen(PORT, () => console.log(`→ http://localhost:${PORT}`));
}

/* --------------------------------------------------------------------- main */

await build();

if (process.argv.includes('--watch')) {
  let t;
  watch(CARDS_DIR, () => {
    clearTimeout(t);
    t = setTimeout(() => build().catch(console.error), 120);
  });
  serve();
}
