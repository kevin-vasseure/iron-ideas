/* Iron Ideas — révision par répétition espacée. Vanilla, sans dépendance.
 *
 * Les fiches viennent de cards.js (généré depuis cards/*.md par build.mjs).
 * La progression vit dans localStorage, jamais dans le repo.
 */
'use strict';

/* --------------------------------------------------------------- constantes */

const CARDS = Array.isArray(window.CARDS) ? window.CARDS : [];

const TYPES = {
  concept: ['Concept', 'var(--t-concept)'],
  argument: ['Argumentation', 'var(--t-argument)'],
  question: ['Question', 'var(--t-question)'],
  piege: ['Piège', 'var(--t-piege)'],
  chiffre: ['Chiffre', 'var(--t-chiffre)'],
  citation: ['Citation', 'var(--t-citation)'],
};
const typeLabel = (t) => (TYPES[t] || [t, 'var(--muted)'])[0];
const typeColor = (t) => (TYPES[t] || [t, 'var(--muted)'])[1];

/** Boîtes de Leitner : délai en jours avant la prochaine révision. */
const BOX_DAYS = [0, 1, 2, 4, 9, 21];
const MAX_BOX = 5;
const DAY = 86_400_000;
/** Nombre de repassages max d'une même fiche dans une session. */
const MAX_REQUEUE = 2;

const RATINGS = [
  { v: 1, label: 'Oublié', hint: 'retour boîte 1' },
  { v: 2, label: 'Difficile', hint: 'même boîte' },
  { v: 3, label: 'Su', hint: 'boîte suivante' },
];

/* -------------------------------------------------------------- persistance */

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem('iron-ideas/' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('iron-ideas/' + k, JSON.stringify(v));
    } catch {
      /* mode privé, quota… on continue sans mémoriser */
    }
  },
};

let progress = LS.get('progress', {});
const saveProgress = () => LS.set('progress', progress);

/** box 0 = jamais vue. */
const stateOf = (c) => progress[c.id] || { box: 0, due: 0, seen: 0, lapses: 0 };
const isNew = (c) => stateOf(c).box === 0;
const isDue = (c) => {
  const s = stateOf(c);
  return s.box === 0 || s.due <= Date.now();
};

/* ------------------------------------------------------------------ filtres */

const saved = LS.get('filters', {});
const filter = {
  tags: new Set(Array.isArray(saved.tags) ? saved.tags : []),
  types: new Set(Array.isArray(saved.types) ? saved.types : []),
  mode: saved.mode === 'all' ? 'all' : 'any',
  q: '',
};
const saveFilters = () =>
  LS.set('filters', { tags: [...filter.tags], types: [...filter.types], mode: filter.mode });

const byId = new Map(CARDS.map((c) => [c.id, c]));

const tagCount = new Map();
for (const c of CARDS) for (const t of c.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);

const typeCount = new Map();
for (const c of CARDS) typeCount.set(c.type, (typeCount.get(c.type) || 0) + 1);

/** Éclate « ns:valeur » ; les tags sans namespace tombent dans le groupe ''. */
const nsOf = (t) => (t.includes(':') ? t.slice(0, t.indexOf(':')) : '');
const tagLabel = (t) => (t.includes(':') ? t.slice(t.indexOf(':') + 1) : t);

const TAG_GROUPS = (() => {
  const g = new Map();
  for (const t of tagCount.keys()) {
    const ns = nsOf(t);
    if (!g.has(ns)) g.set(ns, []);
    g.get(ns).push(t);
  }
  for (const list of g.values()) list.sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), 'fr'));
  // Le groupe sans namespace d'abord, les autres par ordre alphabétique.
  return [...g.entries()].sort((a, b) => (a[0] ? a[0].localeCompare(b[0], 'fr') : -1));
})();

function matches(c) {
  if (filter.types.size && !filter.types.has(c.type)) return false;
  if (filter.tags.size) {
    const hit = filter.mode === 'all'
      ? [...filter.tags].every((t) => c.tags.includes(t))
      : c.tags.some((t) => filter.tags.has(t));
    if (!hit) return false;
  }
  if (filter.q) {
    const hay = (c.title + ' ' + c.recto + ' ' + c.verso + ' ' + c.tags.join(' ')).toLowerCase();
    if (!filter.q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

const selected = () => CARDS.filter(matches);

/* ---------------------------------------------------------- micro-markdown */

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(→)/g, '$1<span class="arrow">$2</span>');

function md(src) {
  if (!src) return '';
  return src
    .split(/\n{2,}/)
    .map((block) => {
      const ls = block.split('\n').filter((l) => l.trim());
      if (!ls.length) return '';
      const all = (re) => ls.every((l) => re.test(l));
      if (all(/^\s*[-*]\s+/))
        return `<ul>${ls.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      if (all(/^\s*\d+[.)]\s+/))
        return `<ol>${ls.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      if (all(/^\s*>\s?/))
        return `<blockquote>${inline(ls.map((l) => l.replace(/^\s*>\s?/, '')).join(' '))}</blockquote>`;
      if (/^###\s/.test(ls[0]))
        return (
          `<h4>${inline(ls[0].replace(/^###\s+/, ''))}</h4>` +
          (ls.length > 1 ? `<p>${ls.slice(1).map(inline).join('<br>')}</p>` : '')
        );
      return `<p>${ls.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

/* -------------------------------------------------------------------- état */

let view = 'review';
let session = null;

const $ = (sel) => document.querySelector(sel);
const $view = $('#view');
const $count = $('#count');
const $keys = $('#keys');
const $filters = $('#filters');

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/* ------------------------------------------------------------------ session */

function startSession(cards) {
  if (!cards.length) return;
  session = { queue: shuffle(cards.map((c) => c.id)), i: 0, revealed: false, requeued: {}, rated: 0 };
  render();
}

const currentCard = () =>
  session && session.i < session.queue.length ? byId.get(session.queue[session.i]) : null;

function rate(v) {
  const card = currentCard();
  if (!card) return;
  const s = { ...stateOf(card) };
  s.seen += 1;
  s.last = Date.now();

  if (v === 1) {
    s.lapses += 1;
    s.box = 1;
    s.due = Date.now();
    const n = (session.requeued[card.id] || 0) + 1;
    if (n <= MAX_REQUEUE) {
      session.requeued[card.id] = n;
      session.queue.push(card.id);
    }
  } else if (v === 2) {
    s.box = Math.max(1, s.box);
    s.due = Date.now() + BOX_DAYS[s.box] * DAY;
  } else {
    // Une fiche neuve sue du premier coup saute la boîte 1 : celle-ci reste
    // réservée aux fiches fragiles.
    s.box = Math.min(MAX_BOX, Math.max(1, s.box) + 1);
    s.due = Date.now() + BOX_DAYS[s.box] * DAY;
  }

  progress[card.id] = s;
  saveProgress();
  session.rated += 1;
  session.i += 1;
  session.revealed = false;
  render();
}

/* ------------------------------------------------------------------ rendus */

const typeBadge = (c) =>
  `<span class="type" style="--tc:${typeColor(c.type)}">${esc(typeLabel(c.type))}</span>`;

const tagList = (c) =>
  `<ul class="tags">${c.tags
    .map(
      (t) =>
        `<li><button data-act="tag" data-tag="${esc(t)}" title="Filtrer sur ce tag">${esc(t)}</button></li>`,
    )
    .join('')}</ul>`;

function renderCard(c, revealed) {
  return `
    <article class="card">
      <div class="card-head">${typeBadge(c)}<span class="card-file">${esc(c.file)}</span></div>
      <h2 class="card-title">${inline(c.title)}</h2>
      <div class="face recto">${md(c.recto)}</div>
      ${
        revealed
          ? `<div class="face verso"><div class="verso-rule">verso</div>${md(c.verso)}</div>${tagList(c)}`
          : ''
      }
    </article>`;
}

function renderReview() {
  const pool = selected();

  /* --- écran d'accueil --- */
  if (!session) {
    const due = pool.filter(isDue);
    const fresh = pool.filter(isNew).length;
    const boxes = [1, 2, 3, 4, 5].map((b) => pool.filter((c) => stateOf(c).box === b).length);
    const total = fresh + boxes.reduce((a, b) => a + b, 0);
    const segs = [
      ['nouvelles', fresh, 'var(--muted)'],
      ...boxes.map((n, i) => [`boîte ${i + 1}`, n, `color-mix(in srgb, var(--accent) ${20 + i * 20}%, var(--rule))`]),
    ];

    $view.innerHTML = `
      <div class="dash">
        <h2>${total ? plural(due.length, 'fiche à revoir', 'fiches à revoir') : 'Aucune fiche ne correspond au filtre'}</h2>
        <dl class="tally">
          <div class="hot"><dt>à revoir</dt><dd>${due.length}</dd></div>
          <div><dt>nouvelles</dt><dd>${fresh}</dd></div>
          <div><dt>acquises · boîte 5</dt><dd>${boxes[4]}</dd></div>
          <div><dt>sélection</dt><dd>${pool.length}</dd></div>
        </dl>
        ${
          total
            ? `<div class="boxes">
                 <div class="boxes-head"><span>répartition</span><span>${plural(pool.length, 'fiche', 'fiches')}</span></div>
                 <div class="boxes-bar">${segs
                   .filter(([, n]) => n)
                   .map(([, n, c]) => `<i style="flex-grow:${n};--seg:${c}"></i>`)
                   .join('')}</div>
                 <div class="boxes-legend">${segs
                   .filter(([, n]) => n)
                   .map(([l, n, c]) => `<span style="--seg:${c}">${l} ${n}</span>`)
                   .join('')}</div>
               </div>`
            : ''
        }
        <div class="cta">
          <button class="btn" data-act="start-due" ${due.length ? '' : 'disabled'}>
            Réviser ${due.length ? `(${due.length})` : ''}
          </button>
          <button class="btn ghost" data-act="start-all" ${pool.length ? '' : 'disabled'}>
            Tout repasser (${pool.length})
          </button>
        </div>
        <p class="note">${
          due.length
            ? 'Tu ne vois le verso qu’après avoir tenté de restituer. Note-toi honnêtement : c’est la note qui fixe le prochain rappel.'
            : pool.length
              ? 'Rien n’est dû aujourd’hui. « Tout repasser » ignore le calendrier — utile avant un débat.'
              : 'Élargis le filtre, ou ajoute des fiches dans <code>cards/</code>.'
        }</p>
      </div>`;
    $keys.innerHTML = '';
    return;
  }

  /* --- fin de session --- */
  const card = currentCard();
  if (!card) {
    const left = selected().filter(isDue).length;
    $view.innerHTML = `
      <div class="dash">
        <h2>Session terminée</h2>
        <dl class="tally">
          <div><dt>fiches notées</dt><dd>${session.rated}</dd></div>
          <div class="${left ? 'hot' : ''}"><dt>encore dues</dt><dd>${left}</dd></div>
        </dl>
        <div class="cta">
          ${left ? '<button class="btn" data-act="start-due">Continuer</button>' : ''}
          <button class="btn ghost" data-act="home">Retour</button>
        </div>
      </div>`;
    $keys.innerHTML = '';
    return;
  }

  /* --- une fiche --- */
  const pct = Math.round((session.i / session.queue.length) * 100);
  const s = stateOf(card);
  $view.innerHTML = `
    <div class="session-head">
      <span>${session.i + 1} / ${session.queue.length}</span>
      <span class="track"><i style="width:${pct}%"></i></span>
      <span>${s.box ? `boîte ${s.box}` : 'nouvelle'}</span>
    </div>
    ${renderCard(card, session.revealed)}
    <div class="actions">
      ${
        session.revealed
          ? RATINGS.map(
              (r) =>
                `<button class="btn" data-act="rate" data-v="${r.v}">
                   <span>${r.label}</span><small><kbd>${r.v}</kbd> ${r.hint}</small>
                 </button>`,
            ).join('')
          : `<button class="btn wide" data-act="flip"><span>Voir le verso</span><small><kbd>espace</kbd></small></button>`
      }
    </div>`;

  $keys.innerHTML = session.revealed
    ? '<span><kbd>1</kbd> oublié</span><span><kbd>2</kbd> difficile</span><span><kbd>3</kbd> su</span><span><kbd>esc</kbd> quitter</span>'
    : '<span><kbd>espace</kbd> retourner</span><span><kbd>esc</kbd> quitter</span>';
}

function renderBrowse() {
  const pool = selected().sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  $view.innerHTML = `
    <input class="search" id="search" type="search" placeholder="Rechercher dans les fiches…"
           value="${esc(filter.q)}" autocomplete="off" />
    ${
      pool.length
        ? `<div class="list">${pool
            .map((c) => {
              const s = stateOf(c);
              return `<details class="row">
                <summary>
                  ${typeBadge(c)}
                  <span class="row-title">${inline(c.title)}</span>
                  <span class="row-box">${s.box ? 'b' + s.box : '—'}</span>
                </summary>
                <div class="row-body">
                  <div class="face recto">${md(c.recto)}</div>
                  <div class="face verso"><div class="verso-rule">verso</div>${md(c.verso)}</div>
                  ${tagList(c)}
                </div>
              </details>`;
            })
            .join('')}</div>`
        : '<p class="empty">Aucune fiche ne correspond.</p>'
    }`;
  $keys.innerHTML = '';

  const box = $('#search');
  box.addEventListener('input', () => {
    filter.q = box.value.trim().toLowerCase();
    const at = box.selectionStart;
    renderBrowse();
    renderChrome();
    const next = $('#search');
    next.focus();
    next.setSelectionRange(at, at);
  });
}

function renderChrome() {
  const pool = selected();
  const due = pool.filter(isDue).length;
  $count.innerHTML = `<b>${due}</b> à revoir · ${pool.length} / ${CARDS.length} fiches`;

  const active = filter.tags.size + filter.types.size;
  const $state = $('#filter-state');
  $state.textContent = active
    ? `${plural(active, 'critère actif', 'critères actifs')}${filter.tags.size > 1 ? ` · ${filter.mode === 'all' ? 'tous' : "n'importe lequel"}` : ''}`
    : 'aucun — toutes les fiches';
  $state.classList.toggle('is-idle', !active);

  $('#filters-body').innerHTML = `
    ${TAG_GROUPS.map(
      ([ns, tags]) => `
      <div class="fgroup">
        <h3>${esc(ns || 'Thèmes')}</h3>
        ${tags
          .map(
            (t) => `<button class="chip ${filter.tags.has(t) ? 'is-on' : ''}" data-act="tag" data-tag="${esc(t)}">
                      ${esc(tagLabel(t))}<span class="n">${tagCount.get(t)}</span>
                    </button>`,
          )
          .join('')}
      </div>`,
    ).join('')}
    <div class="fgroup">
      <h3>Types</h3>
      ${[...typeCount.keys()]
        .sort()
        .map(
          (t) => `<button class="chip ${filter.types.has(t) ? 'is-on' : ''}" data-act="type" data-type="${esc(t)}">
                    ${esc(typeLabel(t))}<span class="n">${typeCount.get(t)}</span>
                  </button>`,
        )
        .join('')}
    </div>
    <div class="fgroup">
      <h3>Croisement</h3>
      <span class="mode">
        <button class="${filter.mode === 'any' ? 'is-on' : ''}" data-act="mode" data-mode="any">n'importe lequel</button>
        <button class="${filter.mode === 'all' ? 'is-on' : ''}" data-act="mode" data-mode="all">tous</button>
      </span>
      ${active ? '<button class="link" data-act="reset">réinitialiser</button>' : ''}
    </div>`;
}

function render() {
  renderChrome();
  if (view === 'review') renderReview();
  else renderBrowse();
  for (const t of document.querySelectorAll('#tabs .tab'))
    t.classList.toggle('is-active', t.dataset.view === view);
}

/* ------------------------------------------------------------------ events */

document.addEventListener('click', (e) => {
  const tab = e.target.closest('#tabs .tab');
  if (tab) {
    view = tab.dataset.view;
    // La recherche n'existe que dans « Parcourir » : la laisser active en
    // révision réduirait le paquet sans que rien ne le signale.
    if (view !== 'browse') filter.q = '';
    render();
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;

  switch (btn.dataset.act) {
    case 'flip':
      session.revealed = true;
      render();
      break;
    case 'rate':
      rate(Number(btn.dataset.v));
      break;
    case 'start-due':
      startSession(selected().filter(isDue));
      break;
    case 'start-all':
      startSession(selected());
      break;
    case 'home':
      session = null;
      render();
      break;
    case 'tag': {
      const t = btn.dataset.tag;
      filter.tags.has(t) ? filter.tags.delete(t) : filter.tags.add(t);
      session = null;
      saveFilters();
      $filters.open = true;
      render();
      break;
    }
    case 'type': {
      const t = btn.dataset.type;
      filter.types.has(t) ? filter.types.delete(t) : filter.types.add(t);
      session = null;
      saveFilters();
      render();
      break;
    }
    case 'mode':
      filter.mode = btn.dataset.mode;
      session = null;
      saveFilters();
      render();
      break;
    case 'reset':
      filter.tags.clear();
      filter.types.clear();
      session = null;
      saveFilters();
      render();
      break;
    case 'reload':
      location.reload();
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (view !== 'review' || !session) return;

  const card = currentCard();
  if (e.key === 'Escape') {
    session = null;
    render();
    return;
  }
  if (!card) return;

  if (!session.revealed && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown')) {
    e.preventDefault();
    session.revealed = true;
    render();
  } else if (session.revealed && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    rate(Number(e.key));
  }
});

/* ------------------------------------------------- hors-ligne / installable */

/* Le service worker sert l'app depuis un cache : elle s'ouvre sans réseau, et
   s'installe sur l'écran d'accueil. Inopérant en file:// (HTTPS ou localhost
   requis), auquel cas l'app fonctionne simplement sans. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* pas de hors-ligne, rien de bloquant */
    });
  });

  // Le worker signale que cards.js a changé : les fiches affichées sont périmées.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'cards-updated') $('#toast').hidden = false;
  });
}

/* -------------------------------------------------------------------- boot */

if (!CARDS.length) {
  $view.innerHTML = `<p class="empty">Aucune fiche chargée.<br><br>
    Lance <code>npm run build</code> (ou <code>node build.mjs</code>) pour compiler
    <code>cards/*.md</code>.</p>`;
} else {
  render();
}
