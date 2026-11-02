# fonts/

`barlow-condensed-500.woff2` / `barlow-condensed-600.woff2`

- Family: **Barlow Condensed** (weights 500, 600), latin subset only — the CJK
  text keeps the system stack.
- License: **SIL Open Font License 1.1** (https://openfontlicense.org), so it can
  ship inside this repo. Source: Google Fonts (`fonts.gstatic.com`, v13 files).
- Why: the display face was `Bahnschrift` (Windows-only) falling back to
  `Arial Narrow` elsewhere, which changed weight *and* width per platform.
  A self-hosted subset is ~22 KB per weight and renders identically everywhere.

Loaded by `static/css/tokens.css` via a relative `url()`, so Vite emits it into
`dist/assets/` with a content hash — no separate static route needed.
