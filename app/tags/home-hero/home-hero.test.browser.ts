import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it, vi } from "vitest";

import HomeHero from "./index.marko";

afterEach(cleanup);

describe("home hero image lifecycle", () => {
  it("cancels pending frame preloads when removed", async () => {
    let preloads: HTMLImageElement[] = [];
    let NativeImage = globalThis.Image;
    vi.spyOn(globalThis, "Image").mockImplementation(function (
      width?: number,
      height?: number,
    ) {
      let image = new NativeImage(width, height);
      preloads.push(image);
      return image;
    });

    let view = await render(HomeHero, {
      assetImages: [
        { id: "frame-0", url: "/frame-0.jpg" },
        { id: "frame-1", url: "/frame-1.jpg" },
        { id: "frame-2", url: "/frame-2.jpg" },
      ],
      collectionHref: "/collections/all",
      cta: "Shop now",
      heading: "Run through winter",
    });

    assert.deepEqual(
      preloads.map((image) => image.getAttribute("src")),
      ["/frame-1.jpg", "/frame-2.jpg"],
    );

    view.cleanup();

    assert.deepEqual(
      preloads.map((image) => image.getAttribute("src")),
      [null, null],
    );
  });
});
