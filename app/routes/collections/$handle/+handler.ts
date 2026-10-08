import { queryCollection } from "../../../data/storefront.ts";
import { readCursor } from "../../../lib/collection-cursor.ts";
import { marketPath } from "../../../lib/market.ts";

const FIRST_PAGE_SIZE = 15;
const NEXT_PAGE_SIZE = 8;

export const GET = Run.GET(async (ctx, next) => {
  let cursor = readCursor(ctx.url);
  if (cursor instanceof Response) return cursor;

  // A cursor here is the "Load more" fallback without JavaScript.
  let collection = await queryCollection(ctx.storefront, ctx.params.handle, {
    after: cursor,
    first: cursor ? NEXT_PAGE_SIZE : FIRST_PAGE_SIZE,
  });
  if (!collection.ok) {
    throw new Error(collection.message, { cause: collection.errors });
  }
  if (!collection.data) return null;

  return next({
    canonicalUrl:
      ctx.url.origin +
      marketPath(
        `/collections/${encodeURIComponent(ctx.params.handle)}`,
        ctx.platform.market.pathPrefix,
      ),
    collection: collection.data,
  });
});
