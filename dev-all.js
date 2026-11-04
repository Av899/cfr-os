/**
 * CFR OS: Unified Development Server Runner
 * Starts both the Express backend (ports 3001, 3002, 3003)
 * and the Next.js frontend (port 3000) concurrently.
 *
 * Usage: node dev-all.js
 */

const { spawn } = require('child_process');
const path = require('path');

const rootDir = __dirname;
const frontendDir = path.join(rootDir, 'frontend');

console.log('[CFR OS] Starting unified development environment...');

// 1. Spawn backend dev-server.js
const backend = spawn('node', ['dev-server.js'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

backend.on('error', (err) => {
  console.error('[Backend Process Error]:', err);
});

// 2. Spawn Next.js frontend dev server
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
});

frontend.on('error', (err) => {
  console.error('[Frontend Process Error]:', err);
});

// Forward termination signals
function cleanup() {
  console.log('\n[CFR OS] Shutting down servers...');
  backend.kill('SIGINT');
  frontend.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

