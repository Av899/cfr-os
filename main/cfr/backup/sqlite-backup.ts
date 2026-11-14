/**
 * CFR OS: Safe Online SQLite Database Backup Engine
 * Uses SQLite's atomic online `VACUUM INTO` command to generate pristine,
 * zero-downtime database snapshots while the POS is actively processing orders.
 * Verifies integrity with `PRAGMA integrity_check`.
 */

import type Database from 'better-sqlite3';
import DatabaseConstructor from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { CfrBackupMetadata } from '../types/reports';

export class BackupFailedError extends Error {
  constructor(message: string) {
    super(`[CFR Backup] Failed: ${message}`);
    this.name = 'BackupFailedError';
  }
}

/**
 * Executes a zero-downtime, non-locking online database backup via `VACUUM INTO`.
 */
export function runSafeBackup(
  db: Database.Database,
  backupDir?: string,
  retentionCount = 30,
): CfrBackupMetadata {
  const targetDir = backupDir || path.resolve(process.cwd(), 'backups');

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
  const filePath = path.join(targetDir, fileName);

  try {
    // SQLite VACUUM INTO creates a brand new compacted copy of the open database.
    // Forward slashes are required for Windows paths in SQLite SQL strings.
    const normalizedPath = filePath.replace(/\\/g, '/');
    db.prepare(`VACUUM INTO '${normalizedPath}'`).run();

    if (!fs.existsSync(filePath)) {
      throw new BackupFailedError('Backup file was not created on disk.');
    }

    const stats = fs.statSync(filePath);

    // Verify integrity of the newly created snapshot
    let integrityStatus = 'OK';
    try {
      const backupDb = new DatabaseConstructor(filePath, { readonly: true });
      const check = backupDb.prepare('PRAGMA integrity_check').get() as { integrity_check?: string };
      backupDb.close();

      integrityStatus = check?.integrity_check || 'OK';
      if (integrityStatus !== 'ok' && integrityStatus !== 'OK') {
        throw new BackupFailedError(`Integrity check reported: ${integrityStatus}`);
      }
    } catch (checkErr: unknown) {
      const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
      throw new BackupFailedError(`Integrity check verification failed: ${msg}`);
    }

    // Apply rolling retention
    enforceRetention(targetDir, retentionCount);

    console.log(`[CFR Backup] ✅ Pristine snapshot created: ${fileName} (${Math.round(stats.size / 1024)} KB, integrity: ${integrityStatus})`);

    return {
      file_name: fileName,
      file_path: filePath,
      size_bytes: stats.size,
      created_at: now.toISOString(),
      integrity_status: integrityStatus,
    };
  } catch (err: unknown) {
    if (err instanceof BackupFailedError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new BackupFailedError(msg || 'Unknown backup execution error');
  }
}

/**
 * Lists available historical backups on disk.
 */
export function listBackups(backupDir?: string): CfrBackupMetadata[] {
  const targetDir = backupDir || path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir).filter((f) => f.startsWith('cfr-backup-') && f.endsWith('.db'));
  const list: CfrBackupMetadata[] = [];

  for (const f of files) {
    const p = path.join(targetDir, f);
    try {
      const s = fs.statSync(p);
      list.push({
        file_name: f,
        file_path: p,
        size_bytes: s.size,
        created_at: s.mtime.toISOString(),
        integrity_status: 'VERIFIED_ON_CREATION',
      });
    } catch {}
  }

  // Sort newest first
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Removes older snapshots exceeding retention count.
 */
function enforceRetention(targetDir: string, maxFiles: number): void {
  try {
    const backups = listBackups(targetDir);
    if (backups.length > maxFiles) {
      const toDelete = backups.slice(maxFiles);
      for (const b of toDelete) {
        fs.unlinkSync(b.file_path);
        console.log(`[CFR Backup] Pruned old snapshot: ${b.file_name}`);
      }
    }
  } catch (err) {
    console.warn('[CFR Backup] Retention pruning warning:', err);
  }
}
