import * as assert from "node:assert/strict";
import { describe, it } from "vitest";

import { variantHref } from "./product.ts";

describe("variant URLs", () => {
  it("builds variant URLs by replacing only product option parameters", () => {
    assert.equal(
      variantHref(
        "other-product",
        [
          { name: "Size", value: "Large" },
          { name: "Color", value: "Green" },
        ],
        [{ name: "Color" }, { name: "Size" }],
        "?Color=Red&ref=campaign&Size=Small&variant=123",
      ),
      "/products/other-product?ref=campaign&Size=Large&Color=Green",
    );
  });

  it("retains the Canadian prefix", () => {
    assert.equal(
      variantHref(
        "test-product",
        [{ name: "Color", value: "Blue" }],
        [{ name: "Color" }],
        "",
        "/en-ca",
      ),
      "/en-ca/products/test-product?Color=Blue",
    );
  });
});
