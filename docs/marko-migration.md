# Marko migration

This branch moves the v3 storefront from Remix 3 components and routing to
Marko 6 and @marko/run. The Shopify integration stays on the framework-neutral
`@shopify/hydrogen` preview, and both runtimes, Node/Fly and Oxygen, remain.

## Decisions

- **Runtimes:** Node/Fly and Oxygen. @marko/run has no Oxygen adapter, so
  `vite/oxygen-adapter.ts` provides one, modelled on marko-chat's Cloudflare
  adapter: MiniOxygen's Vite plugin runs the Worker in workerd for dev and
  preview, and the build emits the single-module Worker and `oxygen.json` that
  Oxygen uploads.
- **Navigation:** a multi-page app. Cross-document view transitions smooth
  page loads when scripting is on and motion is not reduced. Cart state comes
  from the cart cookie on each load; variant selection updates in place with
  `history.replaceState`.
- **Remix:** kept only for the Node server's middleware in `server.node.ts`
  (fetch listener, compression, static files). Valibot replaces
  `remix/data-schema`; Vitest replaces `remix test`.
- **Framework gaps:** worked around in the app and recorded in
  `run/agent-feedback` and `marko/agent-feedback` on `store-feedback` topic
  branches.

## Architecture

| v3                                       | Marko                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `app/routes.ts`, controllers             | `app/routes/**` (`+page.marko`, `+handler.ts`, `+404`, `+500`)        |
| market middleware (prefix rewrite)       | `app/request.ts`, shared by both entries, ahead of the router         |
| storefront middleware                    | `app/middleware/storefront.ts` from the root `+middleware.ts`         |
| unmatched paths through middleware       | a `$$rest` route exporting every verb                                 |
| `<Document>` component                   | `<app-document>`, which each page wraps itself in                     |
| `remix/component` UI and `clientEntry`   | `.marko` tags; Marko decides what hydrates                            |
| `css()` mixins                           | a `style.module.css` per tag; tokens and fonts in `app/styles`        |
| frames and Load more                     | `<product-grid>` fetching JSON from `/collections/:handle/products`   |
| browser entry                            | `<shopify-runtime>` and modules in `app/lib/browser/`                 |
| Remix Assets, Pitlane                    | Vite through @marko/run                                               |
| `remix test` with `remix/component/test` | Vitest: a node project and a browser project (@marko/testing-library) |

## Behaviour that differs from v3

- Pages load as documents; widgets no longer survive navigation, so the cart
  trigger loses focus and the footer re-observes its visibility on each page.
- @marko/run renders the branded 404 page only for requests that accept
  HTML. Browsers and crawlers send that; bare API clients get an empty 404.
- Load more fetches the next page as JSON and renders the cards on the client
  instead of reloading a server-rendered frame. The no-JS `?cursor=` fallback
  is unchanged.
- The runtime carries two injectable values v3 took as app options: `now()`
  for the seasonal snow and `subscriptionRateLimiter`.

## Workarounds for @marko/run and Marko

- `vite/app-platform.ts` replaces the adapter's `typeInfo`, so `ctx.platform`
  is the app's own type rather than the Node adapter's.
- Middleware types `next()`'s result as `Response | NextResponse`; the two
  are mutually unassignable.
- The storefront middleware catches `Symbol.for("Run.Response.NotMatched")`
  to try Shopify's redirects for 404s that handlers return as `null`.
- `app/tags/cart-view` guards `state?.pending.lines?.has(...)`: Marko drops the
  short-circuit of an optional chain split into tracked members.
- `gql.tada` is a dev dependency so `mtc`, which forces declaration emit, can
  name Hydrogen's cart handler type.
- No-JS checks run against builds: in development @marko/vite hides the page
  until its scripts run.
