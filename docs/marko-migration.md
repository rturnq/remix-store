# Marko migration

This branch moves the v3 storefront from Remix 3 components and routing to
Marko 6 and @marko/run. The Shopify integration stays on the framework-neutral
`@shopify/hydrogen` preview.

## Decisions

- **Runtimes:** Node/Fly and Oxygen from the start. @marko/run has no Oxygen
  adapter, so `vite/oxygen-adapter.ts` provides one, modelled on marko-chat's
  Cloudflare adapter: MiniOxygen's Vite plugin runs the Worker in dev and
  preview, and the build emits the single-file Worker and `oxygen.json` that
  Oxygen uploads.
- **Navigation:** a multi-page app with cross-document view transitions. Cart
  state comes from the cart cookie on each load; variant selection updates in
  place with `history.replaceState`.
- **Remix:** removed wherever Marko or @marko/run covers it. Remix server
  middleware may still run inside @marko/run through a context shim. Valibot
  replaces `remix/data-schema`; Vitest replaces `remix test`.
- **Framework gaps:** worked around in the app, and recorded in
  `run/agent-feedback` (or Marko's) on a topic branch.

## Architecture

| v3                                                        | Marko                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `app/routes.ts`, controllers                              | `app/routes/**` (`+page.marko`, `+handler.ts`, `+404`, `+500`) |
| market middleware (prefix rewrite)                        | a request wrapper shared by both entries, ahead of the router  |
| storefront middleware (client, Shopify routes, redirects) | root `+middleware.ts`                                          |
| `remix/component` server UI                               | `.marko` tags                                                  |
| `clientEntry` islands                                     | `.marko` tags; Marko decides what hydrates                     |
| `css()` mixins                                            | `<style>` blocks per tag; tokens and fonts in the layout       |
| frames and Load more                                      | a fragment handler for product cards and a small Load more tag |
| Remix Assets, Pitlane                                     | Vite through @marko/run                                        |

`app/data/*`, `app/lib/*`, buyer-IP resolution, rate limiting and the GraphQL
documents carry over unchanged apart from validation.

## Phases

1. Scaffold both runtimes: dependencies, Vite configs, the Oxygen adapter,
   the Node server entry, the market wrapper and root middleware, rendering a
   layout and home page from the Storefront.
2. Static pages: layout (head, navbar, footer, sale banner), 404/500,
   policies, robots and sitemaps.
3. Catalog: home, collections with Load more, product page (server-rendered).
4. Interactivity: cart drawer and page, product details, subscribe form,
   navbar/footer effects, analytics, snow.
5. Tests: Vitest for units and requests; Playwright e2e across Node,
   MiniOxygen dev and the Oxygen build.
6. Deploy: Dockerfile build step, Fly and Oxygen workflows.
7. Cleanup: remove Remix UI, Pitlane and dead code; update README and skills.
