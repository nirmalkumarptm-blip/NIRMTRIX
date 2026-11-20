// Placeholder web build: copies the UI preview. Replace with the real bundler once the SQLite-backed UI exists.
import { mkdirSync, copyFileSync } from 'node:fs'; mkdirSync('www', { recursive: true }); copyFileSync('nirmtrix-ui-preview.html', 'www/index.html'); console.log('www/index.html written');
