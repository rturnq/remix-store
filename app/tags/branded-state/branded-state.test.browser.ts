import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it } from "vitest";

import BrandedState from "./index.marko";

afterEach(cleanup);

describe("branded states", () => {
  it("renders a branded state with fallback art and one semantic heading", async () => {
    let { container } = await render(BrandedState, {
      kind: "empty",
      heading: "Your cart is empty",
      copy: "Add something soft.",
      href: "/collections/all",
      icon: "cart",
      linkLabel: "Shop all",
    });

    let headings = container.querySelectorAll("h1");
    assert.strictEqual(headings.length, 1);
    assert.strictEqual(headings[0]?.textContent, "Your cart is empty");
    // The matrix art is drawn from the image on a canvas, never shown as one.
    assert.strictEqual(
      container.querySelector('img[src="/brand/matrix/empty.png"]'),
      null,
    );
    let link = container.querySelector('a[href="/collections/all"]');
    assert.ok(link);
    assert.strictEqual(
      link.querySelector("use")?.getAttribute("href"),
      "#cart",
    );
    assert.match(link.textContent ?? "", /Shop all/);
  });
});
