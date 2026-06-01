// Encrypt an HTML artifact for the /projects workspace.
//
// Usage:
//   node scripts/encrypt-artifact.mjs <input.html> <password> [outName]
//
// Produces public/projects/artifacts/<outName>.enc.json containing an AES-GCM
// ciphertext (key derived from the password via PBKDF2). The plaintext is never
// written to the public folder, so the encrypted file is useless without the
// password. Prints the SHA-256 password hash and a manifest snippet to paste in.
//
// The KDF + cipher params here MUST match the browser decryption in
// public/projects/viewer.html.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ITERATIONS = 150000;

const [, , inputPath, password, outNameArg] = process.argv;
if (!inputPath || !password) {
  console.error('Usage: node scripts/encrypt-artifact.mjs <input.html> <password> [outName]');
  process.exit(1);
}

const html = fs.readFileSync(inputPath, 'utf8');

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(html, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
// Web Crypto's AES-GCM output is ciphertext || authTag, so match that layout.
const payload = Buffer.concat([ciphertext, tag]);

const blob = {
  v: 1,
  kdf: 'PBKDF2',
  hash: 'SHA-256',
  iterations: ITERATIONS,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  ciphertext: payload.toString('base64'),
};

const base = (outNameArg || path.basename(inputPath).replace(/\.html?$/i, ''))
  .replace(/[^a-z0-9-_]/gi, '-');
const outDir = path.join('public', 'projects', 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${base}.enc.json`);
fs.writeFileSync(outFile, JSON.stringify(blob));

const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

console.log(`Wrote ${outFile}`);
console.log(`passwordHash: ${passwordHash}`);
console.log('\nManifest snippet:');
console.log(JSON.stringify({
  id: base,
  title: 'TODO title',
  description: 'TODO description',
  category: 'TODO',
  date: new Date().toISOString().slice(0, 10),
  access: 'protected',
  filename: `${base}.enc.json`,
  passwordHash,
}, null, 2));
