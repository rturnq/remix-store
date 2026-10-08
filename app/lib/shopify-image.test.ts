import * as assert from "node:assert/strict";
import { describe, it } from "vitest";

import { responsiveImageWidths, shopifyImageUrl } from "./shopify-image.ts";

describe("Shopify images", () => {
  it("sizes Shopify CDN and mock.shop images while preserving parameters", () => {
    assert.equal(
      shopifyImageUrl("https://cdn.shopify.com/image.jpg?crop=center", 480),
      "https://cdn.shopify.com/image.jpg?crop=center&width=480",
    );
    assert.equal(
      shopifyImageUrl("https://cdn.mock.shop/image.jpg", 319.6),
      "https://cdn.mock.shop/image.jpg?width=320",
    );
  });

  it("does not rewrite third-party or invalid image URLs", () => {
    assert.equal(
      shopifyImageUrl("https://images.example.com/image.jpg?w=1200", 480),
      "https://images.example.com/image.jpg?w=1200",
    );
    assert.equal(shopifyImageUrl("/local/image.jpg", 480), "/local/image.jpg");
  });

  it("does not request widths larger than the source image", () => {
    assert.deepEqual(responsiveImageWidths(800), [320, 480, 640, 800]);
    assert.deepEqual(responsiveImageWidths(500), [320, 480, 500]);
    assert.deepEqual(responsiveImageWidths(319.6), [320]);
    assert.deepEqual(responsiveImageWidths(200), [200]);
  });
});
