import {
  querySitemapResources,
  type SitemapResourceType,
} from "../../../data/seo-resources.ts";
import { marketPath } from "../../../lib/market.ts";
import {
  sitemapResponse,
  sitemapUnavailable,
  type SitemapUrl,
} from "../../../lib/sitemap.ts";

// `/sitemap/products/1.xml`: one page of US and Canadian URLs for a resource type.
export const GET = Run.GET(async (ctx) => {
  let type = sitemapType(ctx.params.type);
  let page = sitemapPage(ctx.params.page);
  if (!type || !page) return new Response("Not Found", { status: 404 });

  try {
    let [usSitemap, caSitemap] = await Promise.all([
      querySitemapResources(ctx.storefront, type, page, "US"),
      querySitemapResources(ctx.storefront, type, page, "CA"),
    ]);
    let usByHandle = new Map(
      usSitemap.items.map((item) => [item.handle, item]),
    );
    let caByHandle = new Map(
      caSitemap.items.map((item) => [item.handle, item]),
    );
    let handles = new Set([...usByHandle.keys(), ...caByHandle.keys()]);
    let urls: SitemapUrl[] = [...handles].flatMap((handle) => {
      let usItem = usByHandle.get(handle);
      let caItem = caByHandle.get(handle);
      let pathname = `/${type}/${handle}`;
      let usLocation = ctx.url.origin + pathname;
      let caLocation = ctx.url.origin + marketPath(pathname, "/en-ca");
      let alternates =
        usItem && caItem
          ? [
              { href: usLocation, hreflang: "en-US" as const },
              { href: caLocation, hreflang: "en-CA" as const },
            ]
          : undefined;
      let sitemapUrl = (
        item: NonNullable<typeof usItem>,
        location: string,
      ): SitemapUrl => ({
        alternates,
        image: item.image?.filepath
          ? {
              caption: item.image.alt ?? undefined,
              location: item.image.filepath,
            }
          : undefined,
        lastModified: item.updatedAt,
        location,
      });
      return [
        ...(usItem ? [sitemapUrl(usItem, usLocation)] : []),
        ...(caItem ? [sitemapUrl(caItem, caLocation)] : []),
      ];
    });
    return sitemapResponse(urls, { fallbackLocation: `${ctx.url.origin}/` });
  } catch (error) {
    return sitemapUnavailable(error);
  }
});

function sitemapType(value: string): SitemapResourceType | null {
  return value === "products" || value === "collections" ? value : null;
}

function sitemapPage(value: string): number | null {
  let match = /^([1-9]\d*)\.xml$/.exec(value);
  if (!match) return null;
  let number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : null;
}
