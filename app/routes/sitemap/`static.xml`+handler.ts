import { marketPath } from "../../lib/market.ts";
import { sitemapResponse } from "../../lib/sitemap.ts";

export const GET = Run.GET((ctx) => {
  let home = `${ctx.url.origin}/`;
  let canadianHome = ctx.url.origin + marketPath("/", "/en-ca");
  let alternates = [
    { href: home, hreflang: "en-US" as const },
    { href: canadianHome, hreflang: "en-CA" as const },
  ];
  return sitemapResponse(
    [
      { alternates, location: home },
      { alternates, location: canadianHome },
    ],
    { fallbackLocation: home },
  );
});
