# The site: pages, drawings and the drafting style

## Pages

| Route | What |
| --- | --- |
| `/` | Home page (`src/site/Landing.tsx`) |
| `#/machine`, `#/machine/AAPL` | The company workbench, opening that ticker |
| `#/machine/build` | A hypothetical business (manual mode) |
| `#/ceo`, `#/live` | CEO mode, the live 3D company |
| `#/course` | Says the modules are for universities, with sign-in and the university edition |
| `admin.<domain>/modules-demo` | The modules prototype, inside the platform console (signed in, with 2FA), for showing universities before they sign up |
| `#/credits` | Every drawing on the site, with its source |
| `universities/`, `demo/` | Static pages (`public/`), sharing the site's menu, theme and stylesheet |

Every page has the same menu and footer (`src/site/SiteNav.tsx`). The theme (System, Light, Dark) is stored in
`localStorage` as `gcm:theme` and shared by the app and the static pages (`public/site-static.js`).

## Drawings

The artwork is real measured drawings from the Historic American Engineering Record and a 1765 *Encyclopédie* plate,
all public domain, listed in `src/site/drawings.ts` and on `#/credits`. Each is stored in `public/drawings/` as an
alpha mask (white lines, transparent paper), so CSS colours it with the theme's ink: blue on paper in light mode, a
blueprint in dark mode (`--draw-ink`, `--draw-paper` in `src/theme.css`).

To add one: put its Commons file title in `scripts/drawings/sources.txt`, run `scripts/drawings/fetch.py`, then crop
and convert it in `scripts/drawings/process.py`, and list it in `drawings.ts` with its source.

The home page's beam engine runs: its flywheel and governor are cut out of the drawing (`engine-flywheel.webp`,
`engine-governor.webp`) and turned in place. It stands still for visitors who ask for reduced motion.

## The drafting style

Every machine on the site is drawn the same way: ink outlines on paper, light ink washes, no chrome or shadows, and
money and levers in red pencil.

- **SVG machines, gauges and course figures** (`src/site/drafting.css`): inside them the theme's neutral tokens are
  remapped to ink and paper. Components keep their own geometry and logic; only colours change.
- **The live 3D company** (`src/live/scene/Drafting.tsx`): every surface becomes paper or an ink wash, warm colours
  become red pencil, and each object gets ink edges and a constant-width silhouette. It redraws on a theme change.

`public/site-static.css` is generated from `src/theme.css` and `src/site/site.css` by `npm run site:static-css` (part
of `npm run build`); don't edit it by hand. The demo video is recorded with `scripts/record-demo.mjs`, and the
universities page screenshots are captures of the course in light mode.
