import * as http from "node:http";
import { fileURLToPath } from "node:url";

import { importRouterMiddleware } from "@marko/run-adapter-node/middleware";
import { compression } from "remix/middleware/compression";
import { staticFiles } from "remix/middleware/static";
import {
  createRequestListener,
  type FetchHandler,
} from "remix/node-fetch-server";
import { createRouter, type Middleware } from "remix/router";

import {
  CDN_ORIGIN_SECRET_HEADER,
  resolveNodeBuyerIp,
} from "./app/buyer-ip.ts";
import { handleRequest } from "./app/request.ts";

const port = parsePort("PORT", process.env.PORT ?? "44100");
// The repository's public files in development; the build's client output,
// which includes them, beside the built server in production.
const publicDir = fileURLToPath(new URL("public", import.meta.url));

const buyerIps = new WeakMap<Request, string>();

const router = createRouter({
  middleware: [
    health(),
    compression(),
    assets(),
    // Root public files keep stable, unfingerprinted URLs, so cache them briefly.
    staticFiles(publicDir, {
      cacheControl: "public, max-age=86400",
      index: false,
    }),
  ],
  defaultHandler({ request }) {
    return handleRequest(request, {
      env: process.env,
      buyerIp: buyerIps.get(request),
    });
  },
});

const handler: FetchHandler = (request, client) => {
  let buyerIp = resolveNodeBuyerIp(request, process.env, client.address);
  if (buyerIp) buyerIps.set(request, buyerIp);
  // Shopify's generic API proxy forwards most request headers upstream.
  request.headers.delete(CDN_ORIGIN_SECRET_HEADER);
  return router.fetch(request);
};

const listener = createRequestListener(handler, {
  trustProxy: process.env.TRUST_PROXY === "true",
});

// Serves Vite's client modules in development; passes straight through in a build.
const vite = importRouterMiddleware();
const server = http.createServer((req, res) =>
  vite(req, res, () => listener(req, res)),
);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

function health(): Middleware {
  return ({ url }, next) =>
    url.pathname === "/health"
      ? new Response("OK", {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
          },
        })
      : next();
}

/** Fingerprinted build output, cached for good; a stale fingerprint never is. */
function assets(): Middleware {
  let serve = staticFiles(publicDir, {
    cacheControl: "public, max-age=31536000, immutable",
    index: false,
  });
  return async (context, next) => {
    let { pathname } = context.url;
    if (!pathname.startsWith("/assets/")) return next();
    let response = await serve(context, () =>
      Promise.resolve(new Response("Not Found", { status: 404 })),
    );
    if (response.status < 400) return response;
    let headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { headers, status: response.status });
  };
}

function parsePort(name: string, value: string): number {
  let port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(
      `Invalid ${name} value "${value}". Expected a port from 1 to 65535.`,
    );
  }
  return port;
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close((error) => process.exit(error ? 1 : 0));
  server.closeAllConnections();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
