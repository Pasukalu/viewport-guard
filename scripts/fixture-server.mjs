import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const allowedFiles = new Map([
  ['/', 'normal.html'],
  ['/normal.html', 'normal.html'],
  ['/overflow.html', 'overflow.html'],
  ['/overflow-evidence.html', 'overflow-evidence.html'],
  ['/errors.html', 'errors.html'],
  ['/delayed.html', 'delayed.html'],
]);

/** Start the local-only fixture server. Port 0 allocates a free test port. */
export async function startFixtureServer(port = 0) {
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
    const file = allowedFiles.get(pathname);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Fixture not found');
      return;
    }
    try {
      const content = await readFile(new URL(`../fixtures/${file}`, import.meta.url));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(content);
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Unable to read fixture');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP fixture server');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
  const fixtureServer = await startFixtureServer(port);
  console.log(`Fixtures: ${fixtureServer.url}/normal.html`);
  console.log(`Overflow: ${fixtureServer.url}/overflow.html`);
  console.log(`Delayed: ${fixtureServer.url}/delayed.html`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await fixtureServer.close(); });
  }
}
