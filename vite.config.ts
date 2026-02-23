import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const testingLogFileName = 'testing.log';
const testingLogApiRoute = '/__tester/log-file';
const dynamicHttpProxyApiRoute = '/__tester/http-proxy';

const readJsonBody = async (
  req: {
    [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  }
) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw) as unknown;
};

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
const maxUpstreamRedirects = 8;

const requestUpstreamWithPostRedirects = async (
  initialUrl: URL,
  body: string
) => {
  let currentUrl = new URL(initialUrl.toString());
  const redirectChain: string[] = [];

  for (let i = 0; i < maxUpstreamRedirects; i += 1) {
    const response = await fetch(currentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body,
      redirect: 'manual'
    });

    const location = response.headers.get('location');
    const hasRedirectLocation = Boolean(location && location.trim());

    if (!redirectStatusCodes.has(response.status) || !hasRedirectLocation) {
      return {
        response,
        finalUrl: currentUrl.toString(),
        redirectChain
      };
    }

    const nextUrl = new URL(location as string, currentUrl);
    redirectChain.push(nextUrl.toString());
    currentUrl = nextUrl;
  }

  throw new Error('Too many redirects while proxying request');
};

const normalizeProxyTargetUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
  if (hasScheme) {
    return trimmed;
  }

  const looksLikeHostPort = /^[\w.-]+:\d+(\/|$)/.test(trimmed);
  if (looksLikeHostPort) {
    return `http://${trimmed}`;
  }

  return trimmed;
};

const testingLogFilePlugin = () => ({
  name: 'testing-log-file',
  configureServer(server: {
    config: { root: string };
    middlewares: {
      use: (
        route: string,
        handler: (
          req: {
            method?: string;
            [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
          },
          res: {
            statusCode: number;
            setHeader: (name: string, value: string) => void;
            end: (body?: string) => void;
          }
        ) => Promise<void>
      ) => void;
    };
  }) {
    const logFilePath = path.resolve(server.config.root, testingLogFileName);

    server.middlewares.use(testingLogApiRoute, async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
        return;
      }

      try {
        const payload = (await readJsonBody(req)) as
          | { action: 'append'; line: string }
          | { action: 'clear' };

        if (payload.action === 'clear') {
          await fs.writeFile(logFilePath, '', 'utf8');
        } else if (payload.action === 'append') {
          await fs.appendFile(logFilePath, `${payload.line}\n`, 'utf8');
        } else {
          throw new Error('Unknown action');
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false }));
      }
    });

    server.middlewares.use(dynamicHttpProxyApiRoute, async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, message: 'Method not allowed' }));
        return;
      }

      try {
        const payload = (await readJsonBody(req)) as {
          url?: unknown;
          payload?: unknown;
        };
        const rawUrl =
          typeof payload.url === 'string'
            ? normalizeProxyTargetUrl(payload.url)
            : '';
        const bodyPayload =
          payload.payload && typeof payload.payload === 'object'
            ? (payload.payload as Record<string, string>)
            : null;

        if (!rawUrl || !bodyPayload) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              message: 'Invalid proxy payload'
            })
          );
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(rawUrl);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              message: 'Invalid URL'
            })
          );
          return;
        }

        if (
          targetUrl.protocol !== 'http:' &&
          targetUrl.protocol !== 'https:'
        ) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              message: 'Only HTTP(S) targets are supported'
            })
          );
          return;
        }

        const encodedBody = new URLSearchParams(bodyPayload).toString();
        const { response: upstreamResponse, finalUrl, redirectChain } =
          await requestUpstreamWithPostRedirects(targetUrl, encodedBody);
        const rawResponse = await upstreamResponse.text();
        const upstreamContentType =
          upstreamResponse.headers.get('content-type') ||
          'text/plain; charset=utf-8';

        res.statusCode = upstreamResponse.status;
        res.setHeader('X-Tester-Upstream-Url', finalUrl);
        res.setHeader(
          'X-Tester-Upstream-Redirected',
          redirectChain.length > 0 ? '1' : '0'
        );
        if (redirectChain.length > 0) {
          res.setHeader(
            'X-Tester-Upstream-Redirect-Chain',
            redirectChain.join(' -> ')
          );
        }
        res.setHeader('Content-Type', upstreamContentType);
        res.end(rawResponse);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Proxy request failed';
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, message }));
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), testingLogFilePlugin()],
  server: {
    port: 5173
  }
});
