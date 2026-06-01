// Edge middleware: give /claude/<id> links a rich preview when shared.
//
// Link-preview crawlers (iMessage, Slack, Twitter, etc.) don't run JS, so the
// generic viewer page can't show artifact-specific Open Graph tags. This
// intercepts /claude/<id>:
//   - Crawler  -> return a tiny HTML page with OG tags from the manifest.
//   - Browser  -> pass through; the vercel.json rewrite serves viewer.html and
//                 the clean URL is preserved.
//
// Runs on the Edge before routing/rewrites, so real files (manifest.json, the
// artifacts folder, viewer.html) are left untouched.

export const config = {
  matcher: ['/claude/:id'],
};

const CRAWLER_RE = /(facebookexternalhit|Facebot|Twitterbot|Slackbot|Slack-ImgProxy|LinkedInBot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|bingbot|Googlebot|embedly|quora link preview|outbrain|vkShare|W3C_Validator|SkypeUriPreview|iframely|Discourse|Mastodon|developers\.google\.com\/\+\/web\/snippet)/i;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/claude\//, '').replace(/\/$/, '');

  // Leave real pages/files alone (anything with a dot, or the known pages).
  if (!seg || seg.includes('.') || seg === 'claude' || seg === 'viewer') return;

  const ua = request.headers.get('user-agent') || '';
  if (!CRAWLER_RE.test(ua)) return; // browser -> continue to the viewer rewrite

  const id = decodeURIComponent(seg);
  let artifact = null;
  try {
    const res = await fetch(new URL('/claude/manifest.json', url.origin), {
      headers: { 'User-Agent': 'sameer-claude-og' },
    });
    if (res.ok) {
      const data = await res.json();
      artifact = (data.artifacts || []).find((a) => a.id === id);
    }
  } catch {
    // fall through to generic preview
  }

  const title = escapeHtml(artifact?.title || 'Claude Workspace');
  const description = escapeHtml(
    artifact?.description || 'A shared workspace of things Claude built.'
  );
  const pageUrl = `${url.origin}/claude/${encodeURIComponent(id)}`;
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
<meta property="og:site_name" content="Claude Workspace">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
<p><a href="${pageUrl}">Open in Claude Workspace</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
