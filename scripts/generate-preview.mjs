// Generate a branded 1200x630 preview image for a /projects project.
//
// Renders an on-brand HTML card (sameer.us cream + clean typography) headless
// with Playwright and saves a PNG into public/projects/images/. Use it for the
// "image" field in public/projects/manifest.json — it's the link-preview (OG)
// image and the dashboard tile thumbnail.
//
// Setup (one time): Playwright is a dev-only tool and is intentionally NOT a
// project dependency, so it never touches the Vercel build. Install it locally:
//
//   npm install -D playwright        (or: npm install -D playwright --no-save)
//   npx playwright install chromium
//
// Usage:
//   node scripts/generate-preview.mjs "<title>" [outfile.png] [options]
//
//   node scripts/generate-preview.mjs "Baby Pool" babypool.png \
//     --subtitle "Guess the birth date, weight & gender" \
//     --detail "$20 buy-in · Winner takes all" \
//     --tag Pool --icon 🍼 --accent "#b45309" --url "sameer.us/babypool"
//
// Options (all optional):
//   --subtitle <text>   secondary line under the title
//   --detail <text>     small third line
//   --tag <text>        category pill (uppercased)
//   --icon <emoji>      emoji/glyph shown above the title
//   --accent <#hex>     pill + accent color (default #b45309)
//   --url <text>        footer URL (default sameer.us)
//   --out <file>        output filename (alternative to the 2nd positional)
//
// If no output filename is given, one is derived from the title.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'public', 'projects', 'images');

// ---- arg parsing ----------------------------------------------------------
const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node scripts/generate-preview.mjs "<title>" [out.png] ' +
    '[--subtitle ..] [--detail ..] [--tag ..] [--icon ..] [--accent #hex] [--url ..]');
  process.exit(argv.length ? 0 : 1);
}

const opts = {};
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    opts[a.slice(2)] = argv[i + 1] ?? '';
    i++;
  } else {
    positionals.push(a);
  }
}

const title = positionals[0];
if (!title) {
  console.error('Error: a title is required.');
  process.exit(1);
}

const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let outName = opts.out || positionals[1] || `${slug || 'preview'}.png`;
if (!/\.png$/i.test(outName)) outName += '.png';

const subtitle = opts.subtitle || '';
const detail = opts.detail || '';
const tag = opts.tag || '';
const icon = opts.icon || '';
const accent = opts.accent || '#b45309';
const url = opts.url || 'sameer.us';

// ---- card HTML ------------------------------------------------------------
// Title size scales down for longer titles so it never overflows the panel.
const titleSize =
  title.length <= 12 ? 124 :
  title.length <= 20 ? 96 :
  title.length <= 30 ? 72 : 56;

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fdf6f0; }
  .panel {
    position: absolute; inset: 36px; background: #fff;
    border: 2px solid #e7d9c8; border-radius: 32px;
    display: flex; flex-direction: column; padding: 48px 56px;
  }
  .content {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center;
  }
  .icon { font-size: 76px; line-height: 1; margin-bottom: 22px; }
  .pill {
    font-size: 22px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    color: ${esc(accent)}; background: color-mix(in srgb, ${esc(accent)} 15%, #ffffff);
    padding: 10px 22px; border-radius: 999px; margin-bottom: 26px;
  }
  h1 { font-size: ${titleSize}px; font-weight: 800; letter-spacing: -2px; color: #2d2a26; line-height: 1.04; max-width: 1000px; }
  .sub { font-size: 40px; font-weight: 500; color: #57534e; margin-top: 26px; max-width: 980px; line-height: 1.25; }
  .detail { font-size: 31px; font-weight: 400; color: #78716c; margin-top: 16px; }
  .url { text-align: center; font-size: 27px; font-weight: 600; letter-spacing: 1px;
         color: #a8a29e; padding-top: 10px; }
</style></head><body>
  <div class="panel">
    <div class="content">
      ${icon ? `<div class="icon">${esc(icon)}</div>` : ''}
      ${tag ? `<span class="pill">${esc(tag)}</span>` : ''}
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
      ${detail ? `<div class="detail">${esc(detail)}</div>` : ''}
    </div>
    ${url ? `<div class="url">${esc(url)}</div>` : ''}
  </div>
</body></html>`;

// ---- render ---------------------------------------------------------------
// Dry run: print the card HTML and exit (handy for previewing/debugging the
// template without launching a browser).
if ('print-html' in opts) {
  console.log(html);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright is not installed. Run:\n' +
    '  npm install -D playwright   (add --no-save to keep it out of the deploy)\n' +
    '  npx playwright install chromium\n' +
    'then re-run this script.'
  );
  process.exit(1);
}

fs.mkdirSync(IMAGES_DIR, { recursive: true });
const outPath = path.join(IMAGES_DIR, outName);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(150); // let fonts/emoji paint
  await page.screenshot({ path: outPath, type: 'png' });
} finally {
  await browser.close();
}

console.log(`Wrote ${path.relative(process.cwd(), outPath)} (1200x630)`);
console.log(`Add to manifest.json:  "image": "${outName}"`);
