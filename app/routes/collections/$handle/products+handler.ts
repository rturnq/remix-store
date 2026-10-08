import { queryCollection } from "../../../data/storefront.ts";
import { readCursor } from "../../../lib/collection-cursor.ts";

const NEXT_PAGE_SIZE = 8;
// The next page of a collection's cards, for the grid's "Load more".
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

export const GET = Run.GET(async (ctx) => {
  let cursor = readCursor(ctx.url);
  if (cursor instanceof Response) return cursor;
  if (!cursor) return new Response("Missing cursor", { status: 400 });

  let collection;
  try {
    collection = await queryCollection(ctx.storefront, ctx.params.handle, {
      after: cursor,
      first: NEXT_PAGE_SIZE,
    });
  } catch (error) {
    if (ctx.request.signal.aborted) throw error;
    console.error("[collection] Unable to load a product page", error);
  }
  if (!collection?.ok) {
    return Response.json(
      { error: "Products could not be loaded." },
      { status: 502, headers: HEADERS },
    );
  }
  if (!collection.data) {
    return Response.json(
      { error: "Collection not found." },
      { status: 404, headers: HEADERS },
    );
  }

  let { nodes, pageInfo } = collection.data.products;
  return Response.json(
    {
      products: nodes,
      nextCursor: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
    },
    { headers: HEADERS },
  );
});
