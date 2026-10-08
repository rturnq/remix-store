import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it } from "vitest";

import { query } from "../../../test/browser-fixtures.ts";
import ShopifyImage from "./index.marko";

afterEach(cleanup);

describe("Shopify image tag", () => {
  it("renders intrinsic dimensions, responsive candidates, and focal position", async () => {
    let { container } = await render(ShopifyImage, {
      image: {
        height: 600,
        url: "https://cdn.shopify.com/image.jpg",
        width: 800,
      },
      alt: "Blue Remix shirt",
      objectPosition: "25% 75%",
      sizes: "(min-width: 810px) 50vw, 100vw",
    });

    let image = query(container, "img", HTMLImageElement);
    assert.strictEqual(image.getAttribute("alt"), "Blue Remix shirt");
    assert.strictEqual(image.getAttribute("width"), "800");
    assert.strictEqual(image.getAttribute("height"), "600");
    assert.strictEqual(
      image.getAttribute("sizes"),
      "(min-width: 810px) 50vw, 100vw",
    );
    assert.match(image.getAttribute("srcset") ?? "", /width=320 320w/);
    assert.match(image.getAttribute("srcset") ?? "", /width=800 800w/);
    assert.strictEqual(image.style.objectPosition, "25% 75%");
  });

  it("does not advertise fake responsive candidates for third-party images", async () => {
    let { container } = await render(ShopifyImage, {
      image: { url: "https://images.example.com/image.jpg", width: 800 },
      alt: "Third-party image",
      sizes: "100vw",
    });

    let image = query(container, "img", HTMLImageElement);
    assert.strictEqual(
      image.getAttribute("src"),
      "https://images.example.com/image.jpg",
    );
    assert.isFalse(image.hasAttribute("srcset"));
    assert.isFalse(image.hasAttribute("sizes"));
  });
});
