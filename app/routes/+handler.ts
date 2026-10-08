import { queryHome } from "../data/storefront.ts";
import { marketPath } from "../lib/market.ts";
import { isUtcDecember } from "../lib/seasonal.ts";

export const GET = Run.GET(async (ctx, next) => {
  let home = await queryHome(ctx.storefront);
  if (!home.ok) throw new Error(home.message, { cause: home.errors });

  return next({
    canonicalUrl:
      ctx.url.origin + marketPath("/", ctx.platform.market.pathPrefix),
    home: home.data,
    showSeasonalSnow: isUtcDecember(ctx.platform.now?.() ?? new Date()),
  });
});
