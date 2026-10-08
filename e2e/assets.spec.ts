import { expect, test } from "playwright/test";

test("serves document assets and loads every browser module", async ({
  page,
  request,
}) => {
  let errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failed: string[] = [];
  page.on("response", (response) => {
    let type = response.request().resourceType();
    if (
      response.status() >= 400 &&
      ["script", "stylesheet", "font"].includes(type)
    ) {
      failed.push(response.url());
    }
  });
  await page.goto("/products/test-product");

  let assets = await page.evaluate(() => {
    let hrefs = (selector: string, attribute: string) =>
      [...document.querySelectorAll(selector)].map(
        (element) =>
          new URL(element.getAttribute(attribute)!, window.location.href).href,
      );
    return {
      stylesheets: hrefs('link[rel="stylesheet"]', "href"),
      fonts: hrefs('link[as="font"]', "href"),
      scripts: hrefs('script[type="module"][src]', "src"),
    };
  });

  // Development injects stylesheets from JavaScript.
  if (process.env.E2E_RUNTIME !== "oxygen-dev") {
    expect(assets.stylesheets.length).toBeGreaterThan(0);
  }
  expect(assets.fonts.length).toBeGreaterThan(0);
  expect(assets.scripts.length).toBeGreaterThan(0);
  for (let [hrefs, contentType] of [
    [assets.stylesheets, "text/css"],
    [assets.fonts, "font/woff2"],
    [assets.scripts, "javascript"],
  ] as const) {
    for (let href of hrefs) {
      let response = await request.get(href);
      expect(response.ok(), href).toBe(true);
      expect(response.headers()["content-type"], href).toContain(contentType);
    }
  }
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
