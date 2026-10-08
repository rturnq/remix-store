---
name: remix-store
description: >
  Builds, reviews, and refactors this Remix Store app using Marko 6, @marko/run,
  framework-agnostic Hydrogen, Node, Oxygen and Vite. Use for app structure,
  routing, middleware, data, UI, browser interaction, tests, and deployment;
  not for implementing Marko or @marko/run themselves.
---

# Build and Review Remix Store

This repository uses **Marko 6** (the Tags API) with **@marko/run** for routing
and builds, and the **framework-agnostic `@shopify/hydrogen` preview**, not
Hydrogen React. Preserve those choices.

## Find Context and Documentation

Read the installed documentation before using unfamiliar APIs:

1. Read this skill, `package.json`, `tsconfig.json` and
   `docs/marko-migration.md`, then the code that owns the behavior.
2. Marko: `node_modules/marko/cheatsheet.md` is the syntax reference.
3. @marko/run: `node_modules/@marko/run/cheatsheet.md` covers routes,
   handlers, middleware, `ctx` and validators.

Treat the installed documentation as canonical. Do not apply Marko 5 (class
API) or React patterns.

For Hydrogen work, read the relevant synced skill under `.agents/skills/`:

| Surface | Synced skill |
| --- | --- |
| Storefront client, `gql`, errors, caching | `hydrogen-storefront-client/SKILL.md` |
| Request handlers and Shopify compatibility routes | `hydrogen-request-handlers/SKILL.md`, `hydrogen-routing/SKILL.md` |
| Cart state, drawer, and metafields | `hydrogen-cart-ui/SKILL.md`, `hydrogen-cart-drawer/SKILL.md`, `hydrogen-cart-metafields/SKILL.md` |
| Product variants and add-to-cart forms | `hydrogen-variant-form/SKILL.md` |
| Collections and predictive search | `hydrogen-collection-browser/SKILL.md`, `hydrogen-predictive-search/SKILL.md` |
| Markets and customer accounts | `hydrogen-markets/SKILL.md`, `hydrogen-customer-account/SKILL.md` |
| Analytics, images, money, and Shop Pay | Matching `hydrogen-*` skill |
| Oxygen and local HTTPS | `hydrogen-oxygen/SKILL.md`, `hydrogen-local-https/SKILL.md` |
| End-to-end Hydrogen verification | `hydrogen-smoke-test/SKILL.md` |

These files must match the exact installed Hydrogen version. After every
Hydrogen upgrade, run `pnpm exec hydrogen skills sync`, then remove the
`.claude` mirror when it is not used; this repository tracks only
`.agents/skills`. Adapt framework examples to @marko/run handlers and Marko
tags.

## Mental Model

### Routes, handlers and middleware

Routes are files under `app/routes/`. A directory is a path segment, `$name` is
a parameter, `$$rest` catches everything, and backticks escape dots
(`` `robots.txt`+handler.ts ``).

- `+handler.ts` exports `Run.GET(...)`, `Run.POST(...)`: return a `Response`,
  call `next(data)` to render the page with `data` on `$global.data`, or return
  `null` for the 404 page.
- `+page.marko` renders a page. Pages wrap themselves in
  `<app-document title=... canonicalUrl=...>`, which owns `<head>`; @marko/run
  layouts cannot set per-page head content, so this app has none.
- `+middleware.ts` runs before handlers for its subtree. Middleware does not
  run for unmatched paths, which is why `$$rest` exists.

```ts
// app/routes/collections/$handle/+handler.ts
export const GET = Run.GET(async (ctx, next) => {
  let collection = await queryCollection(ctx.storefront, ctx.params.handle);
  if (!collection.ok) throw new Error(collection.message);
  if (!collection.data) return null;
  return next({ collection: collection.data });
});
```

Request values live on `ctx` (`$global` in templates): `ctx.storefront`,
`ctx.shell` (menus, cart, sale, analytics shop) and `ctx.platform` (`env`,
`buyerIp`, `cache`, `waitUntil`, `market`, `now`, `subscriptionRateLimiter`).

### Tags

Tags live in `app/tags/<name>/index.marko` with a `style.module.css`. State is
`<let>`, derived values are `<const>`, effects are `<script>` (browser only,
clean up with `$signal.onabort`), events are `onClick() {...}`.

```marko
<let/count=0>
<button onClick() { count++ }>Clicked ${count} times</button>
```

Marko decides what hydrates: event handlers, `<script>` and state assigned in
the browser make a tag interactive, and only the data those parts read is
serialized. There is no `clientEntry`. Keep browser-reachable values plain
data; class instances and imported functions passed as input do not serialize.
Use `client import` for browser-only modules (`app/lib/browser/*`).

## Store Architecture

| File | Responsibility |
| --- | --- |
| `app/request.ts` | Fetch boundary: market prefix resolution, then the router |
| `app/routes/+middleware.ts` | `private, no-store` documents and the storefront middleware |
| `app/middleware/storefront.ts` | Storefront client, Shopify routes, shell data, 404 redirects |
| `app/routes/$$rest/+handler.ts` | Sends every unmatched path through the middleware |
| `app/runtime.ts` | `Runtime`/`AppPlatform`: what each runtime passes as `ctx.platform` |
| `app/tags/app-document` | `<head>`, navbar, footer, Shopify scripts |
| `app/tags/shopify-runtime` | Starts ShopifyScripts, page views, cart analytics |
| `server.node.ts` | Node/Fly entry: health, buyer IP, compression, static files |
| `app/entry.oxygen.ts` | Oxygen Worker entry |
| `vite.config.ts`, `vite.oxygen.config.ts` | One @marko/run config per runtime |
| `vite/oxygen-adapter.ts` | @marko/run adapter for Oxygen (MiniOxygen dev/preview, Worker build) |

Keep routes, data and tags runtime-neutral. Node-only imports belong in
`server.node.ts` or build tooling. Never read secrets in browser code or from
`process.env` outside `server.node.ts`; read `ctx.platform.env`.

## Work Within the App

- Preserve the package manager, scripts, runtimes, middleware order, explicit
  `.ts` relative imports, abort signals, response status and headers, and
  no-JavaScript behavior.
- Keep exact versions in `package.json` unless the user requests an upgrade.
  Do not run `hydrogen setup` on this app.
- Forms work without JavaScript first: a plain `<form>` posts to a handler
  that redirects (303) or re-renders; tags enhance it.
- The app is multi-page. Do not add client-side routing; cross-document view
  transitions (`app/styles/global.css`) smooth navigation.
- Raw HTML uses `$!{...}` only after sanitizing (`app/lib/policy-html.ts`).
  `<script>` in Marko is an effect; write literal scripts with `<html-script>`.
- Request-scoped values belong on `ctx`; avoid module-global request state.
- Record @marko/run or Marko gaps in that repository's `agent-feedback/` on a
  topic branch rather than patching them here.

## Hydrogen Integration

- Create `createShopifyRequestContext()` and `createStorefrontClient()` per
  request in middleware. Use one Shopify request context per request.
- Read environment, cache and `waitUntil` from `ctx.platform`. Never expose
  private tokens to browser code.
- Author static Storefront documents with `gql()` in server modules and pass
  user input through variables.
- Treat transport failures as thrown errors and GraphQL errors as returned
  data. Validate required data before rendering.
- Apply Shopify request-context response headers at the final middleware
  boundary and preserve immutable-header handling.
- Keep personalized HTML `private, no-store`. Node has no Cache API and caches
  Storefront data in memory.
- Validate GraphQL with the installed Hydrogen CLI.

## Verify the Behavior

Unit and route tests use Vitest. Route tests call the app through
`createTestApp()` in `app/testing/storefront.ts`, which loads it through Vite
with the @marko/run plugin and fakes the Storefront API. Load the project
`testing-practices` skill when writing or reviewing tests.

Before handing off a complete change, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:oxygen
```

For runtime changes, exercise the request path under Node (`pnpm dev`) and the
Worker (`pnpm dev:oxygen` or `pnpm preview:oxygen`); run `pnpm test:e2e` and the
Oxygen e2e scripts for behavior that crosses pages. No-JavaScript checks need a
build: development keeps the page hidden until its scripts run.

The `.env.example` values target the live production store. Never automate a
purchase or mutation that can charge money without explicit approval. Do not
run deploy, commit, push, or destructive git commands unless explicitly asked.
