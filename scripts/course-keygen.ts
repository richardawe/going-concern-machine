import { mkdir, writeFile } from 'node:fs/promises';
import { generateKeys } from '../src/course/seal';

// Makes the course key pair. The public key is published with the site (students seal with it). The private key is
// written to the file given (default course-private-key.json, which git ignores) and goes in two places only:
// the SUBMISSION_PRIVATE_KEY Actions secret, and the lecturer page, which asks for the file.
// Usage: npm run course:keygen -- [path/to/private-key.json]
const target = process.argv[2] ?? 'course-private-key.json';
const { publicKey, privateKey } = await generateKeys();
const created = new Date().toISOString();
await mkdir('public/course', { recursive: true });
await writeFile('public/course/submission-key.json', JSON.stringify({ created, publicKey }, null, 1) + '\n');
await writeFile(target, JSON.stringify(privateKey) + '\n', { mode: 0o600 });
console.log(`Public key: public/course/submission-key.json (commit it).\nPrivate key: ${target}. Keep it secret:\n  1. Repository Settings → Secrets and variables → Actions → New secret SUBMISSION_PRIVATE_KEY, paste the file's contents.\n  2. Load the same file on the lecturer page (#/course/lecturer).\nSubmissions sealed with an older key can only be opened with that older private key.`);
