import { robotsResponse } from "../lib/robots.ts";

export const GET = Run.GET((ctx) =>
  robotsResponse({
    origin: ctx.url.origin,
    shopId: ctx.shell.analyticsShop?.shopId,
    sitemapPath: "/sitemap.xml",
  }),
);
