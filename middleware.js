// Edge middleware: serve project pages from the root domain.
//
// Artifacts live at sameer.us/<id> (the root domain). This middleware is
// the ONLY thing that gives meaning to a root-level /<id>:
//   - If <id> matches a viewer-rendered artifact in the manifest:
//       * crawler (iMessage, Slack, Twitter, ...) -> OG-tagged HTML preview
//       * real browser                            -> serve the artifact viewer
//   - Otherwise: return undefined so the request is handled exactly as before
//     (homepage SPA, /projects dashboard, /babypool, /api/*, static files, ...).
//
// Because the default is pass-through, existing pages are never shadowed.

export const config = {
  // Single root segment only. This already excludes "/" (homepage) and any
  // multi-segment path (/api/*, /projects/*, /babypool/admin, static folders).
  matcher: ['/:id'],
};

const CRAWLER_RE = /(facebookexternalhit|Facebot|Twitterbot|Slackbot|Slack-ImgProxy|LinkedInBot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|bingbot|Googlebot|embedly|quora link preview|outbrain|vkShare|W3C_Validator|SkypeUriPreview|iframely|Discourse|Mastodon|developers\.google\.com\/\+\/web\/snippet)/i;

// Single-segment paths that are real pages/handlers — never treat as artifacts.
const RESERVED = new Set(['projects', 'api', 'static', 'assets', 'index']);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\//, '').replace(/\/$/, '');

  // Leave the homepage, static files (anything with a dot), and reserved
  // pages alone — no manifest lookup, no interception.
  if (!seg || seg.includes('.') || RESERVED.has(seg)) return;

  // Look the id up in the manifest. Only "viewer artifacts" (those with a
  // filename and no external url) are served here.
  let artifact = null;
  try {
    const res = await fetch(new URL('/projects/manifest.json', url.origin), {
      headers: { 'User-Agent': 'sameer-projects-mw' },
    });
    if (res.ok) {
      const data = await res.json();
      artifact = (data.artifacts || []).find(
        (a) => a.id === seg && a.filename && !a.url
      );
    }
  } catch {
    return; // manifest unavailable -> behave as if not an artifact
  }

  if (!artifact) return; // not one of ours -> pass through to the normal site

  const id = artifact.id;
  const ua = request.headers.get('user-agent') || '';

  // Crawlers: return a lightweight page carrying the Open Graph tags.
  if (CRAWLER_RE.test(ua)) {
    const title = escapeHtml(artifact.title || 'Projects');
    const description = escapeHtml(artifact.description || 'Live projects and experiences, published by Claude.');
    const pageUrl = `${url.origin}/${encodeURIComponent(id)}`;
    const image = `${url.origin}/logo512.png`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${image}">
<meta property="og:site_name" content="Projects">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
<p><a href="${pageUrl}">Open in Projects</a></p>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  }

  // Real browser. Proxy the right static file so the URL stays /<id>:
  //   - public    -> the artifact's own HTML, served directly as a full page
  //                  (no chrome/iframe — best for self-contained apps like babypool)
  //   - protected -> the viewer, which prompts for the password and decrypts
  const target = artifact.access === 'protected'
    ? '/projects/viewer.html'
    : `/projects/artifacts/${artifact.filename}`;
  try {
    const res = await fetch(new URL(target, url.origin), {
      headers: { 'User-Agent': 'sameer-projects-mw' },
    });
    if (!res.ok) return;
    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch {
    return; // fall through if the file can't be fetched
  }
}
