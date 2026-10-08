import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it } from "vitest";

import { query } from "../../../test/browser-fixtures.ts";
import ShopAll from "./fixtures/shop-all.marko";

afterEach(cleanup);

describe("pill links", () => {
  it("renders an accessible pill link backed by the icon sprite", async () => {
    let { container } = await render(ShopAll);

    let link = query(container, "a", HTMLAnchorElement);
    assert.strictEqual(link.getAttribute("href"), "/collections/all");
    assert.match(link.textContent ?? "", /Shop/);
    assert.match(link.textContent ?? "", /All/);
    assert.strictEqual(link.getAttribute("data-expanded-text"), "All");
    assert.isTrue(link.hasAttribute("data-icon-always-visible"));
    let icon = query(link, "svg", SVGElement);
    assert.strictEqual(icon.getAttribute("aria-hidden"), "true");
    assert.strictEqual(
      icon.querySelector("use")?.getAttribute("href"),
      "#fast-forward",
    );
  });
});
