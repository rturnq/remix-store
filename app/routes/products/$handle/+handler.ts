import {
  queryProduct,
  queryProductNavigation,
} from "../../../data/storefront.ts";
import { marketPath } from "../../../lib/market.ts";

export const GET = Run.GET(async (ctx, next) => {
  let { url } = ctx;
  let [product, menu] = await Promise.all([
    queryProduct(ctx.storefront, ctx.params.handle, url.searchParams),
    queryProductNavigation(ctx.storefront, url.host),
  ]);
  if (!product.ok) throw new Error(product.message, { cause: product.errors });
  if (!product.data) return null;

  return next({
    canonicalUrl:
      url.origin +
      marketPath(
        `/products/${encodeURIComponent(ctx.params.handle)}`,
        ctx.platform.market.pathPrefix,
      ),
    menu,
    product: product.data,
    search: url.search,
    shopPayStoreUrl:
      ctx.platform.env.PUBLIC_CHECKOUT_DOMAIN?.trim() ||
      ctx.storefront.storeUrl,
  });
});
