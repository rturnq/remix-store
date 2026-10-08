import { act, cleanup, render } from "@marko/testing-library";
import {
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  it,
  vi,
} from "vitest";

import type { ProductData } from "../../data/storefront.ts";
import { resetBrowserCartStore } from "../../lib/browser/cart-store.ts";
import { CA_MARKET, US_MARKET, type ActiveMarket } from "../../lib/market.ts";
import {
  flushAsync,
  installShopifyActions,
  query,
  submit,
  waitFor,
} from "../../../test/browser-fixtures.ts";
import {
  BLUE_VARIANT_ID,
  RED_VARIANT_ID,
  createProduct,
} from "../../../test/product-fixtures.ts";
import ProductDetails from "./index.marko";

const shopPayStoreUrl = "https://example.myshopify.com";

let replacedUrls: string[] = [];
let originalUrl = "";

beforeAll(installShopifyActions);
beforeEach(() => {
  originalUrl = location.href;
  replacedUrls = [];
});
afterEach(() => {
  cleanup();
  resetBrowserCartStore();
  history.replaceState(history.state, "", originalUrl);
});

describe("product form", () => {
  it("updates variant media and price immediately while preserving URL state", async () => {
    let { container } = await renderProduct(createProduct(), {
      search: "?ref=campaign&Color=Red",
    });

    let red = query(container, 'a[href*="Color=Red"]', HTMLAnchorElement);
    let blue = query(container, 'a[href*="Color=Blue"]', HTMLAnchorElement);
    let missing = query(container, "button:disabled", HTMLButtonElement);
    assert.strictEqual(red.getAttribute("aria-current"), "true");
    let shopPayLink = getShopPayLink(container);
    assert.ok(shopPayLink);
    assert.strictEqual(
      shopPayLink.getAttribute("aria-label"),
      "Buy with Shop Pay",
    );
    let checkoutUrl = new URL(shopPayLink.href);
    assert.strictEqual(checkoutUrl.origin, shopPayStoreUrl);
    assert.strictEqual(checkoutUrl.pathname, "/cart/111:1");
    assert.strictEqual(getComputedStyle(shopPayLink).height, "64px");
    assert.match(blue.textContent ?? "", /Sold out/);
    assert.strictEqual(missing.disabled, true);

    let optionMenu = query(container, "details", HTMLDetailsElement);
    let optionSummary = query(container, "summary", HTMLElement);
    await act(() => optionSummary.click());
    assert.strictEqual(optionMenu.open, true);
    await act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    assert.strictEqual(optionMenu.open, false);
    assert.strictEqual(document.activeElement, optionSummary);

    await act(() => blue.click());
    let updatedRed = query(
      container,
      'a[href*="Color=Red"]',
      HTMLAnchorElement,
    );
    let updatedBlue = query(
      container,
      'a[href*="Color=Blue"]',
      HTMLAnchorElement,
    );
    assert.strictEqual(updatedBlue.getAttribute("aria-current"), "true");
    assert.strictEqual(updatedRed.getAttribute("aria-current"), null);
    assert.strictEqual(
      container
        .querySelector('input[name="merchandiseId"]')
        ?.getAttribute("value"),
      BLUE_VARIANT_ID,
    );
    assert.match(
      container.querySelector('img[alt="Blue product"]')?.getAttribute("src") ??
        "",
      /blue\.jpg\?width=1200/,
    );
    assert.match(
      container.querySelector("h1")?.closest("section")?.textContent ?? "",
      /\$15\.00/,
    );
    assert.strictEqual(
      container.querySelector('button[name="add-to-cart"]')?.textContent,
      "Sold out",
    );
    assert.strictEqual(getShopPayLink(container), null);
    // Variant selection replaces the URL in place; pages are separate documents.
    assert.deepEqual(replacedUrls, [
      "/products/test-product?ref=campaign&Color=Blue",
    ]);

    let combinedListing = query(
      container,
      'a[href*="related-product"]',
      HTMLAnchorElement,
    );
    assert.strictEqual(
      combinedListing.getAttribute("href"),
      "/products/related-product?ref=campaign&Color=Green",
    );

    await act(() => updatedRed.click());
    assert.strictEqual(
      container
        .querySelector('input[name="merchandiseId"]')
        ?.getAttribute("value"),
      RED_VARIANT_ID,
    );
    await flushAsync();
    assert.strictEqual(getShopPayLink(container)?.hasAttribute("href"), true);
  });

  it("preserves the Shop Pay height when changing available variants", async () => {
    let product = createProduct();
    let blueVariant = product.options[0]?.optionValues.find(
      (value) => value.name === "Blue",
    )?.firstSelectableVariant;
    assert.ok(blueVariant);
    blueVariant.availableForSale = true;
    let { container } = await renderProduct(product);

    let blue = query(container, 'a[href*="Color=Blue"]', HTMLAnchorElement);
    await act(() => blue.click());
    await flushAsync();

    let shopPayLink = getShopPayLink(container);
    assert.ok(shopPayLink);
    assert.strictEqual(new URL(shopPayLink.href).pathname, "/cart/222:1");
    assert.strictEqual(getComputedStyle(shopPayLink).height, "64px");
  });

  it("hydrates and submits only verified identifiers for the selected sold-out variant", async () => {
    let requestBody: URLSearchParams | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      assert.instanceOf(init?.body, URLSearchParams);
      requestBody = init?.body as URLSearchParams;
      return Response.json({ message: "Notification saved", success: true });
    });
    let { container } = await renderProduct(createProduct(), {
      search: "?Color=Red",
    });
    assert.strictEqual(container.querySelector("#back-in-stock-email"), null);

    let blue = query(container, 'a[href*="Color=Blue"]', HTMLAnchorElement);
    await act(() => blue.click());
    assert.strictEqual(
      container
        .querySelector('input[name="product-handle"]')
        ?.getAttribute("value"),
      "test-product",
    );
    assert.strictEqual(
      container
        .querySelector('input[name="variant-id"]')
        ?.getAttribute("value"),
      BLUE_VARIANT_ID,
    );
    assert.strictEqual(
      container.querySelector('input[name="variant-title"]'),
      null,
    );

    let email = query(container, "#back-in-stock-email", HTMLInputElement);
    let form = email.closest("form");
    assert.instanceOf(form, HTMLFormElement);
    email.value = "member@example.com";
    await act(() => submit(form as HTMLFormElement));
    await waitFor(() => container.querySelector('[role="status"]') !== null);

    assert.ok(requestBody);
    assert.deepEqual([...requestBody.keys()].sort(), [
      "consent",
      "email",
      "product-handle",
      "variant-id",
    ]);
    assert.strictEqual(requestBody.get("product-handle"), "test-product");
    assert.strictEqual(requestBody.get("variant-id"), BLUE_VARIANT_ID);
    assert.strictEqual(
      container.querySelector('[role="status"]')?.textContent,
      "Notification saved",
    );
  });

  it("hides Shopify’s default-only variant selector", async () => {
    let { container } = await renderProduct(createDefaultVariantProduct());

    assert.strictEqual(container.querySelector("details"), null);
    assert.strictEqual(container.querySelector('button[name="Title"]'), null);
    assert.strictEqual(
      container
        .querySelector('input[name="merchandiseId"]')
        ?.getAttribute("value"),
      RED_VARIANT_ID,
    );
    let add = query(container, 'button[name="add-to-cart"]', HTMLButtonElement);
    assert.strictEqual(add.disabled, false);
    assert.strictEqual(add.textContent, "Add to cart");
  });

  it("disables add-to-cart until a variant is resolved", async () => {
    let product = createProduct();
    product.selectedOrFirstAvailableVariant = null;
    let { container } = await renderProduct(product);

    let add = query(container, 'button[name="add-to-cart"]', HTMLButtonElement);
    assert.strictEqual(add.disabled, true);
    assert.strictEqual(add.textContent, "Select options");
    assert.strictEqual(
      container
        .querySelector('input[name="merchandiseId"]')
        ?.getAttribute("value"),
      "",
    );
    assert.strictEqual(container.querySelector('a[aria-current="true"]'), null);
    assert.strictEqual(getShopPayLink(container), null);
  });

  it("retains the Canadian prefix in variant and form navigation", async () => {
    let { container } = await renderProduct(createProduct(), {
      market: CA_MARKET,
      search: "?ref=campaign&Color=Red",
    });

    assert.match(
      container.querySelector('a[href*="Color=Blue"]')?.getAttribute("href") ??
        "",
      /^\/en-ca\/products\/test-product\?/,
    );
    assert.strictEqual(
      container.querySelector("form")?.getAttribute("action"),
      "/en-ca/api/cart",
    );
  });
});

async function renderProduct(
  product: ProductData,
  options: { market?: ActiveMarket; search?: string } = {},
) {
  let search = options.search ?? "";
  // Variant selection reads the page's own query string.
  history.replaceState(history.state, "", `${location.pathname}${search}`);
  let replaceState = history.replaceState.bind(history);
  vi.spyOn(history, "replaceState").mockImplementation((state, title, url) => {
    if (url == null) return replaceState(state, title, url);
    replacedUrls.push(String(url));
  });

  let view = await render(ProductDetails, {
    market: options.market ?? US_MARKET,
    menu: { items: [] },
    product,
    search,
    shopPayStoreUrl,
  });
  await flushAsync();
  return view;
}

function getShopPayLink(container: ParentNode): HTMLAnchorElement | null {
  let link = container
    .querySelector("hydrogen-shop-pay-button")
    ?.shadowRoot?.querySelector("a");
  return link instanceof HTMLAnchorElement ? link : null;
}

function createDefaultVariantProduct() {
  let product = createProduct();
  let variant = product.selectedOrFirstAvailableVariant!;
  variant.title = "Default Title";
  variant.selectedOptions = [{ name: "Title", value: "Default Title" }];
  product.options = [
    {
      name: "Title",
      optionValues: [
        { name: "Default Title", firstSelectableVariant: variant },
      ],
    },
  ];
  product.adjacentVariants = [variant];
  product.encodedVariantExistence = "v1_0";
  product.encodedVariantAvailability = "v1_0";
  return product;
}
