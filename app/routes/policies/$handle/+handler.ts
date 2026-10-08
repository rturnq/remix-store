import { isPolicyHandle, queryPolicy } from "../../../data/policies.ts";
import { marketPath } from "../../../lib/market.ts";

export const GET = Run.GET(async (ctx, next) => {
  let { handle } = ctx.params;
  if (!isPolicyHandle(handle)) return null;

  let result = await queryPolicy(ctx.storefront, handle);
  if (!result.ok) throw new Error(result.message, { cause: result.errors });
  if (!result.data) return null;

  return next({
    canonicalUrl:
      ctx.url.origin +
      marketPath(`/policies/${handle}`, ctx.platform.market.pathPrefix),
    policy: result.data,
  });
});
