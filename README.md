# Iron Ideas

Fiches de révision pour concepts, argumentations et contre-arguments — pour ne
plus perdre ce qu'on a mis deux heures à formuler dans un débat.

Recto : le concept, la question, l'objection.
Verso : l'explication, la réponse, le contre-argument, le piège à éviter.

Tout vit dans le repo. Pas de base de données, pas de dépendance : du Markdown
en entrée, un fichier HTML en sortie.

## Démarrer

```bash
npm start
```

Compile `cards/*.md`, sert l'app sur <http://localhost:4321> et recompile à
chaque modification d'une fiche (recharge la page pour voir le changement).

Pour compiler sans serveur :

```bash
npm run build
```

`app/cards.js` est un artefact généré mais **commité** : après un `git clone`,
tu peux ouvrir `app/index.html` directement dans un navigateur, sans rien
lancer. Node n'est nécessaire que pour recompiler après édition des fiches.

## Écrire une fiche

Les fichiers de `cards/` sont de **simples bacs** : leur nom n'a aucune valeur
sémantique et n'apparaît nulle part dans la navigation. **Toute l'organisation
passe par les tags.** Déplacer une fiche d'un fichier à l'autre ne change rien
— seuls ses tags comptent.

En sortie de débat, `cards/inbox.md` évite d'avoir à choisir où ranger.

```markdown
---
tags: politique, rhétorique          # hérités par toutes les fiches du fichier
---

## L'intellectuel organique
type: piège
tags: auteur:gramsci, sociologie     # s'ajoutent aux tags hérités

Que veut dire « intellectuel organique » — et l'erreur à ne pas commettre ?

---

**Pas** « un intellectuel à la solde ».

C'est un intellectuel **produit organiquement par une classe** pour élaborer et
diffuser sa vision du monde. Le lien est **structurel, pas transactionnel**.

→ Utiliser « organique » comme une insulte, c'est manquer le concept.
```

Les règles, en entier :

| Élément | Rôle |
| --- | --- |
| frontmatter `tags:` | tags par défaut de toutes les fiches du fichier |
| `## Titre` | ouvre une fiche ; le titre sert d'**identifiant** — il doit être unique |
| `type:` / `tags:` / `source:` | métadonnées, juste après le titre |
| `---` seul sur sa ligne | sépare le recto du verso |

Le Markdown reconnu dans le corps : `**gras**`, `*italique*`, `` `code` ``,
listes `-` et `1.`, citations `>`, liens `[texte](url)`, sous-titres `###`.
Une flèche `→` en début de phrase est mise en évidence — pratique pour la
punchline à retenir.

### Types

`concept` · `argument` · `question` · `piège` · `chiffre` · `citation`

Le type est un axe distinct des tags : c'est la *forme* de la fiche, pas son
sujet. Il pilote la pastille de couleur et se filtre séparément. Par défaut :
`concept`.

### Tags

Un tag est un mot libre, en minuscules. Deux conventions utiles :

- **`ns:valeur`** → regroupé sous le namespace `ns` dans l'interface.
  Déjà en usage : `auteur:gramsci`, `source:débat-rn-confus`.
- un tag `auteur:` par penseur cité rend possible « révise-moi tout ce qui
  touche Gramsci », en travers des fichiers.

Le filtrage croise **n'importe lequel** (union) ou **tous** (intersection) —
`marxisme` + `rhétorique` en mode « tous » sort les fiches directement
utilisables en débat.

## Réviser

Cinq boîtes de Leitner. Chaque fiche note remonte, stagne ou retombe :

| Note | Effet | Rappel |
| --- | --- | --- |
| **Oublié** | retour boîte 1 + repassée dans la session | même jour |
| **Difficile** | reste dans sa boîte | 1 à 21 j selon la boîte |
| **Su** | boîte suivante | 1 · 2 · 4 · 9 · 21 j |

Une fiche neuve sue du premier coup saute la boîte 1 : celle-ci reste réservée
aux fiches fragiles.

Clavier : `espace` retourne, `1` / `2` / `3` notent, `esc` quitte la session.

« Tout repasser » ignore le calendrier — utile juste avant un débat.

La progression vit dans le `localStorage` du navigateur, **jamais dans le
repo** : renommer le titre d'une fiche remet sa progression à zéro, éditer son
contenu ne change rien.

## Hébergement

Publié sur GitHub Pages par `.github/workflows/pages.yml` à chaque push sur
`main` : le workflow recompile `cards/*.md` et sert `app/` comme racine du site.
Le déploiement ne dépend donc pas d'un `app/cards.js` à jour dans le commit.

Prérequis, une seule fois : **Settings → Pages → Source → « GitHub Actions »**.

Attention : la progression étant dans le `localStorage`, elle est **cloisonnée
par origine**. Ce que tu révises sur le site publié est invisible depuis un
`app/index.html` ouvert en local. Mieux vaut s'en tenir à un seul des deux.

## Hors-ligne et installation

`app/sw.js` met l'app en cache : elle s'ouvre sans réseau et s'installe sur
l'écran d'accueil d'un téléphone (`manifest.webmanifest`). Nécessite HTTPS ou
localhost — en `file://` le worker ne s'enregistre pas, l'app fonctionne
simplement sans.

Stratégie *stale-while-revalidate* : la page s'affiche depuis le cache, puis se
rafraîchit en arrière-plan. Quand `cards.js` a réellement changé, une bannière
« Fiches mises à jour » propose de recharger — sinon les nouvelles fiches
n'apparaîtraient qu'à l'ouverture suivante.

Bump `VERSION` dans `app/sw.js` pour purger tous les caches précédents.

L'icône est un SVG. Android l'accepte ; iOS ne sait pas s'en servir pour
l'écran d'accueil et affichera une capture de la page à la place — déposer un
`apple-touch-icon.png` de 180×180 dans `app/` suffit à corriger ça.

## Structure

```
cards/*.md      les fiches — la seule chose à éditer
build.mjs       compilateur + serveur de dev (Node natif, zéro dépendance)
app/index.html  l'app
app/style.css
app/app.js      filtres, boîtes de Leitner, rendu Markdown
app/sw.js       cache hors-ligne
app/cards.js    généré — ne pas éditer
```

## Pistes d'enrichissement

- fiches liées (`voir: autre-titre`) pour naviguer d'un concept à son objection
- un mode « débat » : tirage aléatoire des seuls `type: piège` et `argument`
- export imprimable
- champ `source:` exploité pour afficher la référence bibliographique
