import { querySitemapPageCounts } from "../data/seo-resources.ts";
import { sitemapIndexResponse, sitemapUnavailable } from "../lib/sitemap.ts";

export const GET = Run.GET(async (ctx) => {
  try {
    let [usCounts, caCounts] = await Promise.all([
      querySitemapPageCounts(ctx.storefront, "US"),
      querySitemapPageCounts(ctx.storefront, "CA"),
    ]);
    let locations = [`${ctx.url.origin}/sitemap/static.xml`];

    for (let type of ["products", "collections"] as const) {
      let pageCount = Math.max(usCounts[type], caCounts[type]);
      for (let page = 1; page <= pageCount; page++) {
        locations.push(`${ctx.url.origin}/sitemap/${type}/${page}.xml`);
      }
    }

    return sitemapIndexResponse(locations);
  } catch (error) {
    return sitemapUnavailable(error);
  }
});
