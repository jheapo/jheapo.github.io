# JHeapo website

Marketing site for JHeapo, built with [Jekyll](https://jekyllrb.com/). Self-contained
(no theme gem), so it builds identically on plain Jekyll and on GitHub Pages.

## Run locally

```sh
cd website
bundle install
bundle exec jekyll serve   # http://localhost:4000
```

No Ruby set up? With Docker:

```sh
docker run --rm -it -v "$PWD:/srv/jekyll" -p 4000:4000 jekyll/jekyll:4 \
  jekyll serve --force_polling
```

## Editing content

Copy is data-driven — you rarely touch HTML:

| Where | What |
|-------|------|
| `_data/features.yml` | The "What it does" feature grid |
| `_data/tour.yml`     | The screenshot showcase rows (copy + `image:` path) |
| `index.html`         | Hero, "Why it matters", CTA banner |
| `_config.yml`        | Title, tagline, `docs_url` |
| `assets/css/main.css`| Colors live in the `:root` block at the top |

## Placeholders to replace

- **Logo / icon** — `assets/img/logo-placeholder.svg`. Referenced by the header,
  footer, hero, and favicon. Drop in the real mark under the same name (or update the
  paths).
- **Screenshots** — `assets/img/screenshot-placeholder.svg`. Add real shots to
  `assets/img/` and point each `_data/tour.yml` row's `image:` at them. Tour copy is
  placeholder until the shots are chosen.

## Deploying

Intended to live under the author's main GitHub site. For now it stands alone.

- **Served at domain root:** leave `baseurl: ""` in `_config.yml`.
- **Served from a subpath** (e.g. `/jheapo`): set `baseurl: "/jheapo"`. All internal
  links use `relative_url`, so they follow `baseurl` automatically.

### Later: URL-based site switching

The end goal is for this site and the main site to be separate but linked by a small
piece of JavaScript that switches between them based on the requested URL. Not wired up
yet — this site is deliberately standalone for now.
