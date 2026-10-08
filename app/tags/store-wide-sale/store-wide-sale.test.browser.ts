import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it } from "vitest";

import { query } from "../../../test/browser-fixtures.ts";
import StoreWideSale from "./index.marko";

afterEach(cleanup);

describe("store-wide sale", () => {
  it("renders one concise sale announcement and hides repeated marquee copy", async () => {
    let { container } = await render(StoreWideSale, {
      locale: "en-US",
      sale: {
        title: "Summer Sale",
        description: "20% off everything",
        endDateTime: "2099-06-02T12:00:00Z",
      },
    });

    let marquee = query(container, "[data-store-wide-sale]", HTMLElement);
    let track = query(marquee, '[aria-hidden="true"]', HTMLElement);
    assert.strictEqual(getComputedStyle(marquee).height, "48px");
    assert.strictEqual(
      marquee.querySelector("p")?.textContent,
      "Summer Sale. 20% off everything. Ends Jun.2.",
    );
    assert.strictEqual(
      container.querySelectorAll('[aria-hidden="true"]').length,
      1,
    );
    assert.strictEqual(
      track.querySelectorAll('[data-marquee-group="true"]').length,
      2,
    );
    assert.match(track.textContent ?? "", /Now thru Jun\.2/);
  });
});
