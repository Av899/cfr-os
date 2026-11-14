#!/usr/bin/env node
/**
 * CFR OS: Nightly Automated SQLite Database Backup Script
 * Usage: node scripts/cfr-backup.js [target_dir]
 */

const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const dbPath = path.join(rootDir, 'flo.db');
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, 'backups');

console.log('[CFR Backup] Starting nightly online database backup...');
console.log(`[CFR Backup] Source database: ${dbPath}`);
console.log(`[CFR Backup] Destination dir: ${targetDir}`);

if (!fs.existsSync(dbPath)) {
  console.error(`[CFR Backup] Error: Source database "${dbPath}" does not exist.`);
  process.exit(1);
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const hh = String(now.getHours()).padStart(2, '0');
const min = String(now.getMinutes()).padStart(2, '0');
const ss = String(now.getSeconds()).padStart(2, '0');

const fileName = `cfr-backup-${yyyy}${mm}${dd}-${hh}${min}${ss}.db`;
const destinationPath = path.join(targetDir, fileName);

try {
  const db = new Database(dbPath, { readonly: true });
  const normalizedDest = destinationPath.replace(/\\/g, '/');

  console.log('[CFR Backup] Executing VACUUM INTO...');
  db.prepare(`VACUUM INTO '${normalizedDest}'`).run();
  db.close();

  const stats = fs.statSync(destinationPath);
  console.log(`[CFR Backup] Snapshot created: ${fileName} (${Math.round(stats.size / 1024)} KB)`);

  // Verify integrity
  console.log('[CFR Backup] Verifying snapshot integrity...');
  const verifyDb = new Database(destinationPath, { readonly: true });
  const check = verifyDb.prepare('PRAGMA integrity_check').get();
  verifyDb.close();

  if (check && (check.integrity_check === 'ok' || check.integrity_check === 'OK')) {
    console.log('[CFR Backup] ✅ Integrity Check: PASSED (PRAGMA integrity_check = ok)');
  } else {
    console.error(`[CFR Backup] ❌ Integrity Check FAILED:`, check);
    process.exit(1);
  }

  // Retention: keep last 30 backups
  const existing = fs
    .readdirSync(targetDir)
    .filter((f) => f.startsWith('cfr-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();

  if (existing.length > 30) {
    const toPrune = existing.slice(30);
    for (const f of toPrune) {
      fs.unlinkSync(path.join(targetDir, f));
      console.log(`[CFR Backup] Pruned older backup: ${f}`);
    }
  }

  console.log('[CFR Backup] Backup run completed successfully.');
} catch (err) {
  console.error('[CFR Backup] Fatal backup error:', err);
  process.exit(1);
}
