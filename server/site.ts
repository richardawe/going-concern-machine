// What search engines and link previews see: robots.txt, sitemap.xml, and the title, description and Open Graph /
// Twitter card tags each public page is served with. The app's pages share one index.html, so the server writes their
// tags in; the static pages (public/universities, public/demo) carry their own.

export interface PageMeta { title: string; description: string }

const HOME: PageMeta = { title: 'Going Concern Lab', description: 'Going Concern Lab: see any business as a machine of cash, capital and momentum, then run it.' };

/** Public pages served from index.html, by path. Anything else on the public host gets the home page's tags. */
export const APP_PAGES: Record<string, PageMeta> = {
  '/': HOME,
  '/sign-in': { title: 'University sign-in · Going Concern Lab', description: 'Sign in with your university email address to reach your university’s Going Concern Lab. No password: we email you a code.' },
  '/legal/privacy': { title: 'Privacy · Going Concern Lab', description: 'How Going Concern Lab, a product of 3D7 Technologies Ltd, uses the information of students and lecturers.' },
  '/legal/accessibility': { title: 'Accessibility · Going Concern Lab', description: 'The Going Concern Lab accessibility statement, and how to tell us about a problem.' },
};

/** Every page listed in sitemap.xml. The tools live behind #/ routes on the home page, which search engines treat as one page. */
export const SITEMAP = ['/', '/universities/', '/demo/', '/sign-in', '/legal/privacy', '/legal/accessibility'];

export const OG_IMAGE = '/og-image.png';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function metaTags(origin: string, path: string, page: PageMeta): string {
  const t = esc(page.title), d = esc(page.description), url = esc(origin + path), img = esc(origin + OG_IMAGE);
  const alt = 'Going Concern Lab: see a business as a machine, then run it.';
  return [
    `<meta name="description" content="${d}"/>`,
    `<meta property="og:type" content="website"/>`, `<meta property="og:site_name" content="Going Concern Lab"/>`,
    `<meta property="og:title" content="${t}"/>`, `<meta property="og:description" content="${d}"/>`, `<meta property="og:url" content="${url}"/>`,
    `<meta property="og:image" content="${img}"/>`, `<meta property="og:image:width" content="1200"/>`, `<meta property="og:image:height" content="630"/>`,
    `<meta property="og:image:alt" content="${alt}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`, `<meta name="twitter:title" content="${t}"/>`, `<meta name="twitter:description" content="${d}"/>`,
    `<meta name="twitter:image" content="${img}"/>`, `<meta name="twitter:image:alt" content="${alt}"/>`,
    `<link rel="canonical" href="${url}"/>`,
  ].join('');
}

/** index.html with the tags for this page. Only the public site is indexed; universities and the console are not. */
export function pageHtml(indexHtml: string, opts: { origin: string; path: string; indexable: boolean; hostKind: string }): string {
  const known = APP_PAGES[opts.path];
  let html = indexHtml;
  if (opts.indexable) {
    const page = known ?? HOME, path = known ? opts.path : '/';
    html = html.replace(/<!--gcm:meta-->[\s\S]*?<!--\/gcm:meta-->/, metaTags(opts.origin, path, page)).replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  } else {
    html = html.replace(/<!--gcm:meta-->[\s\S]*?<!--\/gcm:meta-->/, '<meta name="robots" content="noindex, nofollow"/>');
  }
  return html.replace('</head>', `<meta name="gcm-host" content="${opts.hostKind}"></head>`);
}

export const robotsTxt = (origin: string, indexable: boolean) => indexable
  ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n';

export const sitemapXml = (origin: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    SITEMAP.map(p => `  <url><loc>${esc(origin + p)}</loc></url>`).join('\n')}\n</urlset>\n`;
