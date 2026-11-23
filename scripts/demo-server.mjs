import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultDemoDir = fileURLToPath(new URL('../demo', import.meta.url));

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Viewport Guard — Local Demo Server</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 20px; background: #071726; color: #ecf6ff; font: 16px/1.6 system-ui, sans-serif; }
    main { max-width: 640px; margin: 0 auto; }
    h1 { margin: 0 0 12px; }
    a { color: #75e3e8; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>Viewport Guard Demo Pages</h1>
    <p>Choose a local demo target to inspect with <code>npm run scan</code> or the desktop app:</p>
    <ul>
      <li><a href="/broken.html">/broken.html</a> — 固定宽度 560px 的 <code>.offer-row</code>（375px 溢出 185px，390px 溢出 170px，768px 溢出 0px）</li>
      <li><a href="/fixed.html">/fixed.html</a> — 修复版 <code>width: 100%; max-width: 560px</code>（三个视口均为 0px）</li>
    </ul>
  </main>
</body>
</html>`;

const allowedFiles = new Map([
  ['/broken.html', 'broken.html'],
  ['/fixed.html', 'fixed.html'],
]);

/** Start the local demo server on 127.0.0.1. Port 0 allocates an ephemeral port. */
export async function startDemoServer(port = 0, demoDir = defaultDemoDir) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(INDEX_HTML);
      return;
    }
    const file = allowedFiles.get(pathname);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Demo page not found');
      return;
    }
    try {
      const content = await readFile(join(demoDir, file));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(content);
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Unable to read demo page');
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP demo server');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    brokenUrl: `${url}/broken.html`,
    fixedUrl: `${url}/fixed.html`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
      server.closeAllConnections();
    }),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 4174);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
  const demoServer = await startDemoServer(port);
  console.log(`Viewport Guard demo server listening on ${demoServer.url}`);
  console.log(`Broken demo: ${demoServer.brokenUrl}`);
  console.log(`Fixed demo:  ${demoServer.fixedUrl}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await demoServer.close();
      process.exit(0);
    });
  }
}
