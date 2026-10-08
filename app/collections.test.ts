import * as assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

import {
  analyticsShopData,
  createStorefrontFetch,
  createTestApp,
  navigationData,
  type StorefrontRequestBody,
} from "./testing/storefront.ts";

describe("collection routes", () => {
  it("renders catalog cards and keeps load more as a GET fallback", async () => {
    let variables: StorefrontRequestBody["variables"] | undefined;
    let app = createTestApp(
      storefrontFetch((body) => {
        variables = body.variables;
        return collectionData({ hasNextPage: true, endCursor: "next-page" });
      }),
    );

    let response = await app.fetch(
      new Request("https://example.com" + "/collections/racing"),
    );
    let html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(variables?.first, 15);
    assert.equal(variables?.after, undefined);
    assert.match(html, /<h1>Racing collection<\/h1>/);
    assert.match(html, /href="?\/products\/racing-shirt"?/);
    assert.match(html, /Racing shirt/);
    assert.match(html, /\$30\.00/);
    assert.match(html, /\$20\.00/);
    assert.match(html, /<form action="?\/collections\/racing"? method="?get"?/);
    assert.match(html, /name="?cursor"? value="?next-page"?/);
  });

  it("serves the next page of cards as JSON without shell data", async () => {
    let variables: StorefrontRequestBody["variables"] | undefined;
    // Only the collection query is mocked: shell, cart, and analytics
    // queries would throw.
    let app = createTestApp(
      createStorefrontFetch({
        RemixCollection(body) {
          variables = body.variables;
          return collectionData({ hasNextPage: true, endCursor: "page-3" });
        },
      }),
    );

    let response = await app.fetch(
      new Request(
        "https://example.com/en-ca/collections/racing/products?cursor=page-2",
      ),
    );
    let page = (await response.json()) as ProductsPage;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(variables?.first, 8);
    assert.equal(variables?.after, "page-2");
    assert.equal(page.products[0].handle, "racing-shirt");
    assert.equal(page.nextCursor, "page-3");
  });

  it("ends the grid when the collection has no further page", async () => {
    let app = createTestApp(
      createStorefrontFetch({
        RemixCollection: () =>
          collectionData({ hasNextPage: false, endCursor: null }),
      }),
    );

    let response = await app.fetch(
      new Request(
        "https://example.com/collections/racing/products?cursor=last",
      ),
    );
    let page = (await response.json()) as ProductsPage;

    assert.equal(response.status, 200);
    assert.equal(page.products[0].handle, "racing-shirt");
    assert.equal(page.nextCursor, null);
  });

  it("reports a page that fails to load so the grid can retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let app = createTestApp(
      createStorefrontFetch({
        RemixCollection: () => {
          throw new Error("Storefront unavailable");
        },
      }),
    );

    let response = await app.fetch(
      new Request(
        "https://example.com/collections/racing/products?cursor=page-2",
      ),
    );

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "Products could not be loaded.",
    });
  });

  it("requires a cursor for the next page", async () => {
    let app = createTestApp(createStorefrontFetch({}));

    let response = await app.fetch(
      new Request("https://example.com/collections/racing/products"),
    );
    assert.equal(response.status, 400);
  });

  it("renders collection metadata", async () => {
    let app = createTestApp(
      storefrontFetch(() =>
        collectionData({ hasNextPage: false, endCursor: null }),
      ),
    );

    let response = await app.fetch(
      new Request("https://example.com/collections/racing"),
    );
    let html = await response.text();

    assert.match(
      html,
      /<link rel="?canonical"? href="?https:\/\/example\.com\/collections\/racing"?/,
    );
    assert.match(
      html,
      /<meta property="?og:image"? content="?https:\/\/example\.com\/social-collections\.jpg"?/,
    );
  });

  it("renders a branded 404 when the collection is missing", async () => {
    let app = createTestApp(storefrontFetch(() => ({ collection: null })));

    let response = await app.fetch(
      new Request("https://example.com" + "/collections/not-a-collection"),
    );
    let html = await response.text();

    assert.equal(response.status, 404);
    assert.match(html, /Page not found/);
  });

  it("rejects oversized cursors before querying the catalog", async () => {
    let app = createTestApp(
      createStorefrontFetch({
        RemixAnalyticsShop: analyticsShopData,
        RemixNavigation: navigationData,
      }),
    );
    let url = new URL("/collections/racing", "https://example.com");
    url.searchParams.set("cursor", "x".repeat(2_049));

    let result = await app.fetch(new Request(url));

    assert.equal(result.status, 400);
  });
});

function storefrontFetch(
  collection: Parameters<typeof createStorefrontFetch>[0][string],
): typeof globalThis.fetch {
  return createStorefrontFetch({
    RemixAnalyticsShop: analyticsShopData,
    RemixCollection: collection,
    RemixNavigation: navigationData,
  });
}

function collectionData(pageInfo: {
  hasNextPage: boolean;
  endCursor: string | null;
}) {
  return {
    collection: {
      id: "gid://shopify/Collection/1",
      handle: "racing",
      title: "Racing collection",
      description: "Racing apparel",
      products: {
        nodes: [
          {
            id: "gid://shopify/Product/1",
            handle: "racing-shirt",
            title: "Racing shirt",
            images: {
              nodes: [
                {
                  id: "gid://shopify/ProductImage/1",
                  url: "https://cdn.shopify.com/racing-shirt.jpg",
                  altText: "Racing shirt",
                  width: 1200,
                  height: 1200,
                },
              ],
            },
            selectedOrFirstAvailableVariant: {
              price: { amount: "20.00", currencyCode: "USD" },
              compareAtPrice: { amount: "30.00", currencyCode: "USD" },
            },
            priceRange: {
              minVariantPrice: { amount: "20.00", currencyCode: "USD" },
              maxVariantPrice: { amount: "20.00", currencyCode: "USD" },
            },
          },
        ],
        pageInfo,
      },
    },
  };
}

type ProductsPage = {
  products: Array<{ handle: string }>;
  nextCursor: string | null;
};
