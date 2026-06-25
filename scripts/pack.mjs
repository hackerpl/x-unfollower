// Pack the extension into a ZIP file for Chrome Web Store submission
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const outDir = 'release';
if (!existsSync(outDir)) {
  mkdirSync(outDir);
}

const zipName = `x-unfollowed-v1.0.0.zip`;
const zipPath = resolve(outDir, zipName);

// Use PowerShell's Compress-Archive to create ZIP
// Include only the files needed for the extension to run
const filesToInclude = [
  'manifest.json',
  'dist/background/index.js',
  'dist/content/index.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const fileList = filesToInclude.map(f => `"${f}"`).join(',');
const cmd = `powershell -Command "Compress-Archive -Path ${fileList} -DestinationPath '${zipPath}' -Force"`;

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\n✅ Extension packed: ${zipPath}`);
} catch (err) {
  console.error('Failed to pack:', err.message);
  process.exit(1);
}
