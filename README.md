# Remix Store

The storefront behind [shop.remix.run](https://shop.remix.run).

The storefront runs on [Marko 6](https://markojs.com) and [@marko/run](https://github.com/marko-js/run) with framework-neutral Hydrogen, on both Node/Fly and Shopify Oxygen.

## Requirements

- Node.js 24
- pnpm 10.33.4

## Local development

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Without `PRIVATE_STOREFRONT_API_TOKEN`, local development queries Shopify with
the store's public token from `.env.example`. Shopify then sees every request as
coming from your machine; populate the private token from the configured
Hydrogen environment to match deployments.

The private Storefront token remains server-only and enables request-aware cart,
checkout, and Shopify redirect handling. Oxygen supplies `oxygen-buyer-ip`; Fly
supplies `fly-client-ip`, or behind Fastly, `x-cdn-client-ip` authenticated by
`CDN_ORIGIN_SECRET` (see [`FLY_DEPLOYMENT.md`](./FLY_DEPLOYMENT.md#fastly-cdn)). Other Node runtimes use the client address resolved by
the Node HTTP listener from the socket or, when explicitly configured behind a
trusted proxy with `TRUST_PROXY=true`, overwritten proxy headers. Never forward
platform buyer-IP headers outside their runtime. `PUBLIC_CHECKOUT_DOMAIN` is not
a runtime input; checkout uses Shopify's
authoritative `cart.checkoutUrl`. The app does not use durable application
sessions or require `SESSION_SECRET`.

`pnpm dev` runs the Node server through `marko-run dev`, with Vite serving and hot-updating browser modules. Use `pnpm dev:oxygen` to run the same app in MiniOxygen's Worker runtime. Both listen on port 44100.

The example environment points at the live production store. Purchases create real orders and charge real money.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:oxygen:dev
pnpm test:e2e:oxygen
pnpm build:oxygen
pnpm preview:oxygen
```

`pnpm test` runs Vitest. Route tests load the app through Vite with the @marko/run plugin and fake the Storefront API (`app/testing/storefront.ts`).

The end-to-end suites use a deterministic local Storefront fixture: `test:e2e` builds and runs the Node server, `test:e2e:oxygen:dev` runs MiniOxygen development, and `test:e2e:oxygen` builds and runs the production Worker. Pull requests exercise all three runtimes. Development hides the page until its scripts run, so the no-JavaScript specs skip MiniOxygen development. Set `BASE_URL` to target an existing deployment instead.

`pnpm build` writes the Node server to `dist/index.mjs` with browser assets in `dist/public/`. The Oxygen build produces a self-contained Worker at `dist/server/index.js` and browser assets in `dist/client/`; MiniOxygen preview and Shopify CLI discover these standard output directories automatically.

## Deployments

| URL                                                                      | What it is                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| [remix-store.freetls.fastly.net](https://remix-store.freetls.fastly.net) | **Use this one.** Fly app behind the Fastly CDN         |
| [remix-store.fly.dev](https://remix-store.fly.dev)                       | Fly origin, bypasses the CDN (debugging, health checks) |

Fastly caches fingerprinted `/assets/*` files and short-lived root `public/`
files; HTML is `private, no-store` and always reaches Fly. Responses served
through Fastly include `X-Cache` and `X-Served-By` headers.

Oxygen deployments use `.github/workflows/oxygen-deployment.yml`; `pnpm deploy:oxygen` deploys a preview locally. Both pass `--build-command 'pnpm build:oxygen'` so Shopify CLI runs this app's Vite build. The build writes the pinned compatibility date to `dist/server/oxygen.json` alongside the Worker.

Fly setup, secrets, local image verification, and continuous deployment are documented in [`FLY_DEPLOYMENT.md`](./FLY_DEPLOYMENT.md).

## Architecture

- `app/routes/` holds the @marko/run routes: `+page.marko` pages, `+handler.ts` request handlers, and the root `+middleware.ts`. A `$$rest` route sends every other path through the middleware, which serves Shopify's own routes.
- `app/request.ts` is the Fetch boundary both runtimes call. It resolves the `/en-ca` market prefix before routing, since @marko/run matches routes ahead of middleware.
- `app/middleware/storefront.ts` creates the request's Hydrogen Storefront client (`ctx.storefront`), serves the cart API, checkout, permalinks and discount links, loads the shell data (`ctx.shell`), and tries Shopify's redirects for 404s.
- `app/runtime.ts` types the bindings each runtime passes the routes as `ctx.platform`: environment, buyer IP, cache, `waitUntil` and market.
- `app/tags/` holds the Marko tags. Pages wrap themselves in `<app-document>`, which sets the head from its input and renders the navbar, footer and Shopify scripts. Marko decides which tags ship JavaScript; browser-only modules live in `app/lib/browser/`.
- `server.node.ts` is the Node/Fly entry: health checks, buyer IP, compression and static files on Remix's server middleware, with Vite's dev middleware in front during development.
- `app/entry.oxygen.ts` is the Oxygen Worker.
- `vite/oxygen-adapter.ts` is the @marko/run adapter for Oxygen. MiniOxygen's Vite plugin runs the Worker in workerd for dev and preview, and the build is rearranged into Oxygen's `dist/server` and `dist/client` layout.

## License

MIT License — see [`LICENSE.md`](./LICENSE.md).
