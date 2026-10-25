import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  if (
    /(^|\/)(settings\.json|library\.json|\.env(?:\..*)?|\.DS_Store)$/.test(file) ||
    /\.(wav|mp3|m4a|webm|pem|p12)$/i.test(file)
  )
    problems.push(file + ': private/runtime file');
  const bytes = fs.readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (
    /(?:sk-api-|sk-cp-)[A-Za-z0-9_-]{24,}/.test(text) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
  )
    problems.push(file + ': credential-shaped content');
  if (/\/Users\/[a-zA-Z0-9_.-]+\//.test(text)) problems.push(file + ': personal absolute path');
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `Checked ${files.length} tracked paths for runtime files, credential patterns and personal paths. Manual release inspection is still required.`
);
