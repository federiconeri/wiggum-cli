import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(join(__dirname, '..', '..'));
const PORT = parseInt(process.env.E2E_BRIDGE_PORT || '3999', 10);

let activePty: import('node-pty').IPty | null = null;

function killActivePty() {
  if (activePty) {
    try { activePty.kill(); } catch { /* already dead */ }
    activePty = null;
  }
}

function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, pty: activePty !== null }));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/terminal.html') {
    const html = readFileSync(join(__dirname, 'terminal.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

const server = createServer(handleHttp);
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const cmd = url.searchParams.get('cmd') || '--help';
  const cwd = resolve(url.searchParams.get('cwd') || process.cwd());
  const cols = parseInt(url.searchParams.get('cols') || '120', 10);
  const rows = parseInt(url.searchParams.get('rows') || '30', 10);

  // Reject cwd outside project root to prevent path traversal
  if (!cwd.startsWith(PROJECT_ROOT)) {
    ws.close(1008, 'cwd must be within project root');
    return;
  }

  killActivePty();

  const nodePty = await import('node-pty');
  const args = cmd.split(/\s+/);
  const bin = process.execPath;
  const wiggumBin = join(__dirname, '..', '..', 'bin', 'ralph.js');

  activePty = nodePty.spawn(bin, [wiggumBin, ...args], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  activePty.onData((data: string) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  activePty.onExit(() => {
    activePty = null;
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on('message', (data: Buffer) => {
    if (activePty) activePty.write(data.toString());
  });

  ws.on('close', killActivePty);
});

function cleanup() {
  killActivePty();
  wss.close();
  server.close();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`E2E bridge running at http://localhost:${PORT}`);
  console.log('Open http://localhost:%d?cmd=--help to test', PORT);
});
