import { marketPath } from "../../lib/market.ts";

export const GET = Run.GET((ctx) =>
  ctx.redirect(
    marketPath("/collections/all", ctx.platform.market.pathPrefix),
    302,
  ),
);
