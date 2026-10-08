// Every path reaches the root middleware, which serves Shopify's own routes
// (cart API, checkout, permalinks) and redirects; anything left is a 404.
const notFound = (ctx: { url: URL }) =>
  new Response(`Not Found: ${ctx.url.pathname}`, { status: 404 });

export const GET = Run.GET(() => null);
export const POST = Run.POST(notFound);
export const PUT = Run.PUT(notFound);
export const PATCH = Run.PATCH(notFound);
export const DELETE = Run.DELETE(notFound);
export const OPTIONS = Run.OPTIONS(notFound);
