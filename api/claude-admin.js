// Admin API for the /claude workspace.
//
// Lets the dashboard (after the main PIN) flip an artifact between public and
// password-protected, and set/change protected passwords — without hand-editing
// manifest.json. Because Vercel's filesystem is read-only at runtime, this
// commits the changes to the GitHub repo via the Git Data API (one atomic
// commit), which triggers an automatic Vercel redeploy.
//
// Requires a GitHub personal access token in the GITHUB_TOKEN env var (repo
// contents write scope, fine-grained token scoped to this repo is ideal).
//
// The encrypt/decrypt scheme MUST match public/claude/viewer.html and
// scripts/encrypt-artifact.mjs.
import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 150000;

const EXPECTED_PIN_HASH =
  process.env.CLAUDE_PIN_HASH ||
  'ad5ef4b29e148afd784de5373b210eb00879dfbf08922c96dc6ce4fc1e064fd9'; // sha256('1495')

const REPO = process.env.GITHUB_REPO || 'SameerWasHere/sameer-gpt';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const ARTIFACTS_DIR = 'public/claude/artifacts';
const MANIFEST_PATH = 'public/claude/manifest.json';

const sha256Hex = (str) => crypto.createHash('sha256').update(str).digest('hex');

function encryptHtml(html, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(html, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([ct, tag]); // ciphertext || tag (matches WebCrypto)
  return {
    v: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: payload.toString('base64'),
  };
}

function decryptBlob(blob, password) {
  const salt = Buffer.from(blob.salt, 'base64');
  const iv = Buffer.from(blob.iv, 'base64');
  const data = Buffer.from(blob.ciphertext, 'base64');
  const key = crypto.pbkdf2Sync(password, salt, blob.iterations || PBKDF2_ITERATIONS, 32, 'sha256');
  const tag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ---- GitHub helpers -------------------------------------------------------

function gh(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sameer-claude-admin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}

async function ghJson(path, options) {
  const res = await gh(path, options);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data.message || `GitHub ${res.status}`;
    throw new Error(`${msg} (${path})`);
  }
  return data;
}

async function readFile(path) {
  const data = await ghJson(`/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${BRANCH}`);
  const content = Buffer.from(data.content || '', 'base64').toString('utf8');
  return { content, sha: data.sha };
}

// Commit several file writes/deletes in a single atomic commit.
async function commitChanges({ writes = [], deletes = [], message }) {
  const ref = await ghJson(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const latestCommitSha = ref.object.sha;
  const commit = await ghJson(`/repos/${REPO}/git/commits/${latestCommitSha}`);
  const baseTree = commit.tree.sha;

  const tree = [
    ...writes.map((w) => ({ path: w.path, mode: '100644', type: 'blob', content: w.content })),
    ...deletes.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
  ];

  const newTree = await ghJson(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });

  const newCommit = await ghJson(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [latestCommitSha] }),
  });

  await ghJson(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return newCommit.sha;
}

// ---- Handler --------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: PIN sent in a header, hashed and compared server-side. The plaintext
  // PIN is never in the page source (only its hash is).
  const pin = req.headers['x-claude-pin'];
  if (!pin || sha256Hex(String(pin)) !== EXPECTED_PIN_HASH) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  if (!process.env.GITHUB_TOKEN) {
    return res.status(501).json({
      error: 'GITHUB_TOKEN is not configured on the server. Set it in the Vercel project env vars to enable saving.',
    });
  }

  try {
    const { id, target, currentPassword, newPassword } = req.body || {};
    if (!id || !['public', 'protected'].includes(target)) {
      return res.status(400).json({ error: 'Provide an artifact id and a target of "public" or "protected".' });
    }

    // Load manifest + locate the artifact.
    const manifestFile = await readFile(MANIFEST_PATH);
    const manifest = JSON.parse(manifestFile.content);
    const artifact = (manifest.artifacts || []).find((a) => a.id === id);
    if (!artifact) return res.status(404).json({ error: `No artifact "${id}".` });

    const currentAccess = artifact.access === 'protected' ? 'protected' : 'public';
    const oldFile = artifact.filename;

    // Get the plaintext HTML for the artifact.
    let html;
    if (currentAccess === 'protected') {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change a protected artifact.' });
      }
      const blobFile = await readFile(`${ARTIFACTS_DIR}/${oldFile}`);
      try {
        html = decryptBlob(JSON.parse(blobFile.content), currentPassword);
      } catch {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    } else {
      const htmlFile = await readFile(`${ARTIFACTS_DIR}/${oldFile}`);
      html = htmlFile.content;
    }

    // Build the new file + manifest entry.
    const writes = [];
    const deletes = [];
    let newFile;

    if (target === 'public') {
      newFile = `${id}.html`;
      writes.push({ path: `${ARTIFACTS_DIR}/${newFile}`, content: html });
      artifact.access = 'public';
      artifact.filename = newFile;
      delete artifact.passwordHash;
    } else {
      if (!newPassword) {
        return res.status(400).json({ error: 'A new password is required to protect an artifact.' });
      }
      newFile = `${id}.enc.json`;
      const blob = encryptHtml(html, newPassword);
      writes.push({ path: `${ARTIFACTS_DIR}/${newFile}`, content: JSON.stringify(blob) });
      artifact.access = 'protected';
      artifact.filename = newFile;
      artifact.passwordHash = sha256Hex(newPassword);
    }

    if (oldFile && oldFile !== newFile) deletes.push(`${ARTIFACTS_DIR}/${oldFile}`);

    writes.push({ path: MANIFEST_PATH, content: JSON.stringify(manifest, null, 2) + '\n' });

    const sha = await commitChanges({
      writes,
      deletes,
      message: `claude workspace: set "${id}" to ${target}`,
    });

    return res.status(200).json({
      ok: true,
      commit: sha,
      access: target,
      note: 'Committed to GitHub. Vercel will redeploy in about a minute.',
    });
  } catch (err) {
    console.error('claude-admin error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
