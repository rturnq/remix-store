import { storefront } from "../middleware/storefront.ts";

export default Run.ALL([
  // Documents are personalized (cart, market), so no shared cache may keep them.
  async (_ctx, next) => {
    let response = await next();
    if (!response.headers.get("Content-Type")?.startsWith("text/html")) {
      return response;
    }
    try {
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch {
      let mutable = new Response(response.body, response);
      mutable.headers.set("Cache-Control", "private, no-store");
      return mutable;
    }
  },
  storefront(),
]);
