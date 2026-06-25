// Build script using esbuild to bundle the Chrome extension
// Bundles background (ESM for service worker) and content (IIFE for content script)

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync } from 'fs';

const outdir = 'dist';

// Ensure output directory exists
if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true });
}

// Common build options
const commonOptions = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
};

async function build() {
  // Bundle background script (Service Worker) as ESM
  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/background/index.ts'],
    outfile: 'dist/background/index.js',
    format: 'esm',
    platform: 'browser',
  });

  // Bundle content script as IIFE (content scripts don't support ES modules)
  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/content/index.ts'],
    outfile: 'dist/content/index.js',
    format: 'iife',
    platform: 'browser',
  });

  console.log('Build completed successfully!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
