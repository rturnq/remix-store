import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it } from "vitest";

import type { ProductCardData } from "../../data/storefront.ts";
import ProductCard from "./index.marko";

afterEach(cleanup);

describe("product cards", () => {
  it("presents the compare-at price as superseded when a product is on sale", async () => {
    let product: ProductCardData = {
      compareAtPrice: "$30.00",
      handle: "racing-shirt",
      id: "shirt",
      images: [],
      isOnSale: true,
      price: "$20.00",
      title: "Racing shirt",
    };
    let { container } = await render(ProductCard, { product, pathPrefix: "" });

    assert.strictEqual(container.querySelector("s")?.textContent, "$30.00");
    assert.strictEqual(
      container.querySelector("s + span")?.textContent,
      "$20.00",
    );
  });
});
