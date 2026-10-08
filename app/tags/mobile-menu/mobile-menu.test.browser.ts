import { act, cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it, onTestFinished } from "vitest";

import type { NavigationMenuData } from "../../data/storefront.ts";
import { flushAsync, query } from "../../../test/browser-fixtures.ts";
import MobileMenu from "./index.marko";

const menu: NavigationMenuData = {
  items: [
    { id: "all", title: "All Products", url: "/collections/all" },
    { id: "apparel", title: "Apparel", url: "/collections/apparel" },
  ],
};

afterEach(cleanup);

describe("mobile menu", () => {
  it("closes on outside interaction and Escape", async () => {
    let { container } = await render(MobileMenu, { menu });
    await flushAsync(1);
    let outside = document.body.appendChild(document.createElement("button"));
    onTestFinished(() => outside.remove());

    let details = query(container, "details", HTMLDetailsElement);
    let summary = query(container, "summary", HTMLElement);
    assert.strictEqual(container.querySelector("form"), null);
    assert.notMatch(details.textContent ?? "", /search/i);

    await act(() => summary.click());
    assert.strictEqual(details.open, true);

    await act(() =>
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
    );
    assert.strictEqual(details.open, false);

    await act(() => summary.click());
    assert.strictEqual(details.open, true);

    await act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    assert.strictEqual(details.open, false);
    assert.strictEqual(document.activeElement, summary);
  });

  it("closes when a menu link is followed", async () => {
    let { container } = await render(MobileMenu, { menu });
    await flushAsync(1);

    let details = query(container, "details", HTMLDetailsElement);
    await act(() => query(container, "summary", HTMLElement).click());
    let link = query(container, 'a[href="/collections/apparel"]', HTMLElement);
    link.addEventListener("click", (event) => event.preventDefault());
    await act(() => link.click());
    assert.strictEqual(details.open, false);
  });
});
