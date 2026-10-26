import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backupDir = path.resolve(__dirname, 'backups', 'pre-relative-decay');

console.log('Restoring pre-relative-decay backup files...');

const filesToRestore = [
  ['config/game-config.json', 'game-config.json'],
  ['js/formulas.js', 'formulas.js'],
  ['js/ui-tooltip-content.js', 'ui-tooltip-content.js'],
  ['simulation/tests/rebuild-acceptance.test.js', 'rebuild-acceptance.test.js']
];

for (const [targetRel, backupRel] of filesToRestore) {
  const targetPath = path.join(rootDir, targetRel);
  const backupPath = path.join(backupDir, backupRel);
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, targetPath);
    console.log(` Restored: ${targetRel}`);
  } else {
    console.error(` Missing backup: ${backupPath}`);
  }
}

console.log('Rollback complete. Running build-bundle...');
import('./build-bundle.mjs');
