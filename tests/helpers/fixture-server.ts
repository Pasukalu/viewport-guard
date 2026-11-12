import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

export async function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const allowed = new Set(['normal.html', 'overflow.html', 'overflow-evidence.html', 'errors.html', 'delayed.html']);
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/disconnect') {
      request.socket.destroy();
      return;
    }
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const file = pathname.slice(1);
    if (!allowed.has(file)) {
      response.writeHead(404).end('Fixture not found');
      return;
    }
    try {
      const content = await readFile(new URL(`../../fixtures/${file}`, import.meta.url));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(content);
    } catch {
      response.writeHead(500).end('Unable to read fixture');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP fixture server');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
