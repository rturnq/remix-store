import { AnalyticsEvent } from "@shopify/hydrogen";
import { act, cleanup, render } from "@marko/testing-library";
import { afterEach, assert, beforeAll, describe, it } from "vitest";

import type { CartInitialData } from "../../data/cart.ts";
import { configureOpenCartAction } from "../../lib/browser/cart-drawer.ts";
import { resetBrowserCartStore } from "../../lib/browser/cart-store.ts";
import { CA_MARKET, US_MARKET, type ActiveMarket } from "../../lib/market.ts";
import {
  createCart,
  createCartInitialData,
} from "../../../test/cart-fixtures.ts";
import {
  createCartApiMock,
  flushAsync,
  installShopifyActions,
  query,
  useAnalyticsSpy,
  useDesktopViewport,
  waitFor,
} from "../../../test/browser-fixtures.ts";
import { createProduct } from "../../../test/product-fixtures.ts";
import ProductDetails from "../product-details/index.marko";
import CartPageContent from "../cart-page-content/index.marko";
import CartShell from "../cart-shell/index.marko";

beforeAll(installShopifyActions);
afterEach(() => {
  cleanup();
  resetBrowserCartStore();
});

describe("cart interactions", () => {
  it("publishes a cart view for each actual drawer opening", async () => {
    useDesktopViewport();
    let events = useAnalyticsSpy();
    let initialData = createCartInitialData();
    await renderShell(initialData);

    let trigger = drawerTrigger();
    let drawer = cartDrawer();
    await act(() => trigger.click());
    await act(() => drawer.close());
    await act(() => trigger.click());

    assert.deepEqual(
      events.map(({ event }) => event),
      [AnalyticsEvent.CART_VIEWED, AnalyticsEvent.CART_VIEWED],
    );
    assert.strictEqual(
      events[0]?.payload.cart?.updatedAt,
      initialData.cart?.updatedAt,
    );
  });

  it("defers a drawer view opened mid-mutation until the cart settles", async () => {
    useDesktopViewport();
    let events = useAnalyticsSpy();
    let api = createCartApiMock();
    await renderShell(createCartInitialData());

    let trigger = drawerTrigger();
    let drawer = cartDrawer();
    let cartViews = () =>
      events.filter(({ event }) => event === AnalyticsEvent.CART_VIEWED);

    // A settled cart publishes on open.
    await act(() => trigger.click());
    assert.strictEqual(cartViews().length, 1);

    let mutation = api.enqueue();
    let increase = query(
      drawer,
      'button[aria-label="Increase quantity"]',
      HTMLButtonElement,
    );
    await act(() => increase.click());
    await waitFor(() => api.requests.length === 1);

    // Reopening while the mutation is in flight waits for the confirmed cart
    // instead of publishing `cart: null`.
    await act(() => drawer.close());
    await act(() => trigger.click());
    assert.strictEqual(cartViews().length, 1);

    let settledCart = createCart(2);
    settledCart.updatedAt = "2026-01-01T00:00:01.000Z";
    mutation.resolve({ cart: settledCart, userErrors: [], warnings: [] });
    await waitFor(() => cartViews().length === 2);

    assert.strictEqual(
      cartViews()[1]?.payload.cart?.updatedAt,
      settledCart.updatedAt,
    );
  });

  it("publishes a full cart page view with its confirmed cart", async () => {
    let events = useAnalyticsSpy();
    let initialData = createCartInitialData();
    await renderPage(initialData);

    assert.strictEqual(events[0]?.event, AnalyticsEvent.CART_VIEWED);
    assert.strictEqual(
      events[0]?.payload.cart?.updatedAt,
      initialData.cart?.updatedAt,
    );
  });

  it("publishes an empty full cart page view as a null cart", async () => {
    let events = useAnalyticsSpy();
    await renderPage({ cart: null });

    assert.deepEqual(events, [
      { event: AnalyticsEvent.CART_VIEWED, payload: { cart: null } },
    ]);
  });

  it("reveals the cart trigger label by width without fading it", async () => {
    useDesktopViewport();
    await renderShell(createCartInitialData());

    let label = query(
      drawerTrigger(),
      "[data-expanded-label]",
      HTMLSpanElement,
    );
    assert.strictEqual(getComputedStyle(label).opacity, "1");
    assert.strictEqual(getComputedStyle(label).transitionProperty, "max-width");
  });

  it("uses server data without fetching and supports every dialog trigger", async () => {
    useDesktopViewport();
    let api = createCartApiMock();
    let initialData = createCartInitialData();
    await renderShell(initialData);
    await renderPage(initialData);

    let mobileTrigger = query(document, 'a[href="/cart"]', HTMLAnchorElement);
    let trigger = drawerTrigger();
    assert.strictEqual(mobileTrigger.getAttribute("aria-haspopup"), null);
    assert.match(trigger.textContent ?? "", /1Item in cart/);
    assert.strictEqual(trigger.getAttribute("aria-expanded"), "false");
    assert.strictEqual(api.requests.length, 0);

    let drawer = cartDrawer();
    await act(() => trigger.click());
    assert.strictEqual(drawer.open, true);
    assert.strictEqual(trigger.getAttribute("aria-expanded"), "true");
    assert.strictEqual(getComputedStyle(drawer).transitionDuration, "0s");
    assert.strictEqual(getComputedStyle(drawer).animationName, "none");
    assert.match(drawer.textContent ?? "", /1 item\(s\) in cart/i);
    assert.match(drawer.textContent ?? "", /Subtotal\$10\.00/);
    assert.match(
      drawer.textContent ?? "",
      /Add \$65\.00 more for free shipping/,
    );
    assert.match(drawer.textContent ?? "", /Check out/);

    drawer.requestClose();
    assert.strictEqual(drawer.open, false);
    await waitFor(() => trigger.getAttribute("aria-expanded") === "false");

    assert.strictEqual(configureOpenCartAction(), true);
    await window.Shopify!.actions!.openCart();
    assert.strictEqual(drawer.open, true);
    assert.strictEqual(trigger.getAttribute("aria-expanded"), "true");

    let close = query(
      drawer,
      'button[aria-label="Close cart"]',
      HTMLButtonElement,
    );
    await act(() => close.click());
    assert.strictEqual(drawer.open, false);
    assert.strictEqual(trigger.getAttribute("aria-expanded"), "false");
  });

  it("renders Canadian cart links, forms, and money with the active market", async () => {
    // en-CA disambiguates the USD fixture with a US prefix; this proves the
    // formatter uses the active market's locale rather than converting money.
    let { container } = await renderPage(
      { cart: createCart() },
      { market: CA_MARKET },
    );

    assert.ok(
      container.querySelector('a[href="/en-ca/products/test-product"]'),
    );
    assert.ok(container.querySelector('form[action="/en-ca/api/cart"]'));
    assert.match(container.textContent ?? "", /US\$10\.00/);
  });

  it("updates USD shipping progress in the drawer and page without promising free shipping", async () => {
    let api = createCartApiMock();
    let cart = createCart();
    cart.cost.subtotalAmount.amount = "50";
    let initialData = { cart };
    await renderShell(initialData);
    await renderPage(initialData);

    let progressBars = () => [
      ...document.querySelectorAll('[role="progressbar"]'),
    ];
    assert.strictEqual(progressBars().length, 2);
    for (let progress of progressBars()) {
      assert.strictEqual(progress.getAttribute("aria-valuenow"), "66");
    }
    assert.match(document.body.textContent ?? "", /Add \$25\.00 more/);
    assert.match(
      document.body.textContent ?? "",
      /Shipping options confirmed at checkout/,
    );
    assert.notMatch(
      document.body.textContent ?? "",
      /Free shipping with a US\$75/,
    );

    let quantity = 1;
    for (let [amount, percentage] of [
      ["74.99", "99"],
      ["75", "100"],
      ["150", "100"],
      ["0", "0"],
    ] as const) {
      let mutation = api.enqueue();
      let increase = document.querySelectorAll(
        'button[aria-label="Increase quantity"]',
      )[1];
      assert.instanceOf(increase, HTMLButtonElement);
      await act(() => (increase as HTMLButtonElement).click());
      await waitFor(() => api.requests.length === quantity);

      let settledCart = createCart(++quantity);
      settledCart.cost.subtotalAmount.amount = amount;
      settledCart.cost.totalAmount.amount = amount;
      mutation.resolve({ cart: settledCart, userErrors: [], warnings: [] });
      await waitFor(
        () =>
          !document.querySelector("main li[aria-busy], li[aria-busy]") &&
          progressBars().length === 2 &&
          progressBars().every(
            (progress) => progress.getAttribute("aria-valuenow") === percentage,
          ),
      );

      let text = document.body.textContent ?? "";
      assert.notMatch(text, /Your shipping is free|Free shipping unlocked/);
      if (Number(amount) >= 75) {
        assert.match(text, /You've reached the US\$75 free shipping minimum/);
      } else {
        assert.match(text, /Add \$[\d.]+ more for free shipping/);
        assert.notMatch(text, /You've reached/);
      }
    }
  });

  it("keeps the USD minimum explanation when Canadian cart money changes to CAD", async () => {
    let api = createCartApiMock();
    let cart = createCart();
    cart.cost.subtotalAmount.amount = "50";
    let initialData = { cart };
    await renderShell(initialData, { market: CA_MARKET });
    await renderPage(initialData, { market: CA_MARKET });

    let text = () => document.body.textContent ?? "";
    let progressBars = () => document.querySelectorAll('[role="progressbar"]');
    assert.strictEqual(progressBars().length, 2);
    for (let progress of progressBars()) {
      assert.strictEqual(progress.getAttribute("aria-valuenow"), "66");
    }
    assert.match(text(), /Add US\$25\.00 more/);
    assert.strictEqual(
      (text().match(/Free shipping with a US\$75 minimum/g) ?? []).length,
      2,
    );
    assert.notMatch(text(), /Shipping options confirmed at checkout/);

    let mutation = api.enqueue();
    let increase = document.querySelectorAll(
      'button[aria-label="Increase quantity"]',
    )[1];
    assert.instanceOf(increase, HTMLButtonElement);
    await act(() => (increase as HTMLButtonElement).click());
    await waitFor(() => api.requests.length === 1);

    let settledCart = createCart(2);
    settledCart.cost.subtotalAmount = { amount: "106", currencyCode: "CAD" };
    settledCart.cost.totalAmount = { amount: "106", currencyCode: "CAD" };
    mutation.resolve({ cart: settledCart, userErrors: [], warnings: [] });
    await waitFor(() => progressBars().length === 0);

    assert.strictEqual(
      (text().match(/Free shipping with a US\$75 minimum/g) ?? []).length,
      2,
    );
    assert.match(text(), /See your shipping options at checkout/);
    assert.notMatch(
      text(),
      /more for free shipping|You've reached|Your shipping is free/,
    );
  });

  it("closes after removing the final line without rendering an empty dialog", async () => {
    useDesktopViewport();
    let api = createCartApiMock();
    await renderShell(createCartInitialData());

    let drawer = cartDrawer();
    await act(() => drawerTrigger().click());
    let mutation = api.enqueue();
    let remove = query(
      drawer,
      'button[aria-label="Remove item"]',
      HTMLButtonElement,
    );
    await act(() => remove.click());
    await waitFor(() => api.requests.length === 1);

    assert.strictEqual(drawer.open, false);
    assert.notMatch(drawer.textContent ?? "", /empty/i);
    assert.match(drawer.textContent ?? "", /Test Product/);
    assert.strictEqual(api.requests[0]?.body.lines?.[0]?.quantity, 0);

    mutation.resolve({ cart: createCart(0), userErrors: [], warnings: [] });
    await flushAsync();
    assert.match(
      document.querySelector('a[href="/collections/all"]')?.textContent ?? "",
      /ShopAll/,
    );
    assert.notMatch(drawer.textContent ?? "", /empty/i);

    assert.strictEqual(configureOpenCartAction(), true);
    await window.Shopify!.actions!.openCart();
    assert.strictEqual(drawer.open, false);
  });

  it("renders compare-at pricing and server-provided automatic discounts", async () => {
    let cart = createCart();
    cart.lines.nodes[0]!.cost.compareAtAmountPerQuantity = {
      amount: "15",
      currencyCode: "USD",
    };
    cart.lines.nodes[0]!.discountAllocations = [
      {
        __typename: "CartAutomaticDiscountAllocation",
        discountedAmount: { amount: "5", currencyCode: "USD" },
      },
    ];
    cart.cost.subtotalAmount.amount = "15";
    cart.cost.totalAmount.amount = "10";
    let { container } = await renderPage({ cart });

    assert.strictEqual(
      container.querySelector("[data-line-price] s")?.textContent,
      "$15.00 each",
    );
    assert.match(container.textContent ?? "", /Automatic discount-\$5\.00/);
    assert.match(container.textContent ?? "", /Total\$10\.00/);
    assert.match(
      container.textContent ?? "",
      /Taxes & shipping details at checkout/,
    );
  });

  it("labels automatic line allocations with the sale title", async () => {
    let cart = createCart();
    cart.cost.totalAmount.amount = "8";
    cart.lines.nodes[0]!.discountAllocations = [
      {
        __typename: "CartAutomaticDiscountAllocation",
        discountedAmount: { amount: "2", currencyCode: "USD" },
      },
    ];
    let { container } = await renderPage(
      { cart },
      { automaticDiscountLabel: "Summer Sale" },
    );

    assert.match(container.textContent ?? "", /Summer Sale-\$2\.00/);
    assert.notMatch(container.textContent ?? "", /Automatic discount/);
  });

  it("does not label code discounts as the store-wide sale", async () => {
    let cart = createCart();
    cart.cost.totalAmount.amount = "7";
    cart.lines.nodes[0]!.discountAllocations = [
      {
        __typename: "CartCodeDiscountAllocation",
        discountedAmount: { amount: "3", currencyCode: "USD" },
      },
    ];
    let { container } = await renderPage(
      { cart },
      { automaticDiscountLabel: "Summer Sale" },
    );

    assert.match(container.textContent ?? "", /Total\$7\.00/);
    assert.notMatch(container.textContent ?? "", /Summer Sale/);
    assert.notMatch(container.textContent ?? "", /Automatic discount/);
  });

  it("keeps one live cart across an empty-cart add and stale server data", async () => {
    let api = createCartApiMock();
    let initialData = { cart: null };
    await renderShell(initialData);
    let product = await renderProduct();

    let drawer = cartDrawer();
    let add = query(product, 'button[name="add-to-cart"]', HTMLButtonElement);
    let mutation = api.enqueue();
    await act(() => add.click());
    await waitFor(() => api.requests.length === 1);
    assert.strictEqual(drawer.open, false);
    assert.strictEqual(add.getAttribute("aria-label"), "Adding to cart");
    assert.strictEqual(
      api.requests[0]?.body.lines?.[0]?.merchandiseId,
      createProduct().selectedOrFirstAvailableVariant?.id,
    );

    mutation.resolve({ cart: createCart(), userErrors: [], warnings: [] });
    await waitFor(() => add.textContent === "Add to cart", "the added check");
    assert.strictEqual(drawer.open, false);
    assert.match(drawerTrigger().textContent ?? "", /1Item in cart/);

    // A page rendered from stale server data still shows the live cart.
    let { container } = await renderPage(initialData);
    assert.match(container.textContent ?? "", /Test Product/);
  });

  it("keeps the dialog closed and reports rejected add-to-cart errors inline", async () => {
    let api = createCartApiMock();
    await renderShell(createCartInitialData(0));
    let product = await renderProduct();

    let drawer = cartDrawer();
    let add = query(product, 'button[name="add-to-cart"]', HTMLButtonElement);
    let mutation = api.enqueue();
    await act(() => add.click());
    await waitFor(() => api.requests.length === 1);
    mutation.resolve({
      cart: null,
      userErrors: [{ message: "This variant is sold out." }],
      warnings: [],
    });
    await waitFor(() => add.textContent === "Add to cart", "the add button");

    assert.strictEqual(drawer.open, false);
    assert.match(
      add.closest("form")?.querySelector('[role="alert"]')?.textContent ?? "",
      /This variant is sold out\./,
    );
  });

  it("keeps rapid controls and checkout interactive while values are pending", async () => {
    let api = createCartApiMock();
    let { container } = await renderPage(createCartInitialData());

    let firstMutation = api.enqueue();
    let secondMutation = api.enqueue();
    let increase = query(
      container,
      'button[aria-label="Increase quantity"]',
      HTMLButtonElement,
    );
    let quantity = query(container, 'input[name="quantity"]', HTMLInputElement);
    let line = () => increase.closest("li");
    let linePrice = () =>
      line()?.querySelector("[data-line-price] p")?.textContent?.trim();

    await act(() => increase.click());
    await waitFor(() => api.requests.length === 1);
    assert.strictEqual(quantity.value, "2");
    assert.strictEqual(getComputedStyle(quantity).transitionDuration, "0s");
    assert.strictEqual(linePrice(), "$10.00");
    assert.strictEqual(increase.disabled, false);
    assert.strictEqual(line()?.getAttribute("aria-busy"), "true");
    assert.strictEqual(quantity.hasAttribute("data-pending"), true);
    let checkout = query(
      container,
      'a[href="https://checkout.example.test/cart"]',
      HTMLAnchorElement,
    );
    assert.strictEqual(checkout.getAttribute("aria-disabled"), null);
    assert.strictEqual(checkout.textContent, "Updating cart…");
    assert.strictEqual(checkout.querySelector("svg"), null);

    await act(() => increase.click());
    await waitFor(() => api.requests.length === 2);
    assert.strictEqual(quantity.value, "3");
    assert.strictEqual(firstMutation.aborted, true);

    let settledCart = createCart(3);
    settledCart.lines.nodes[0]!.cost.totalAmount.amount = "25";
    settledCart.cost.subtotalAmount.amount = "25";
    settledCart.cost.totalAmount.amount = "25";
    secondMutation.resolve({ cart: settledCart, userErrors: [], warnings: [] });
    await waitFor(() => line()?.hasAttribute("aria-busy") === false);

    // The store settles the line before its cost, publishing each state.
    await waitFor(() => checkout.textContent === "Check out");
    assert.strictEqual(quantity.value, "3");
    assert.strictEqual(linePrice(), "$25.00");
    assert.strictEqual(quantity.hasAttribute("data-pending"), false);
    assert.strictEqual(checkout.textContent, "Check out");
    assert.instanceOf(checkout.querySelector("svg"), SVGElement);
  });

  it("rolls back a rejected quantity and renders its error beside the line", async () => {
    let api = createCartApiMock();
    let { container } = await renderPage(createCartInitialData());

    let mutation = api.enqueue();
    let increase = query(
      container,
      'button[aria-label="Increase quantity"]',
      HTMLButtonElement,
    );
    let quantity = query(container, 'input[name="quantity"]', HTMLInputElement);
    await act(() => increase.click());
    await waitFor(() => api.requests.length === 1);
    assert.strictEqual(quantity.value, "2");

    mutation.resolve({
      cart: null,
      userErrors: [
        {
          code: "INVALID",
          field: ["lines", "0", "quantity"],
          message: "Only one item is available.",
        },
      ],
      warnings: [],
    });
    await waitFor(() => quantity.value === "1");

    assert.strictEqual(quantity.getAttribute("aria-invalid"), "true");
    let errorId = quantity.getAttribute("aria-describedby");
    assert.ok(errorId);
    let error = document.getElementById(errorId);
    assert.match(error?.textContent ?? "", /Only one item is available\./);
    assert.strictEqual(error?.getAttribute("role"), "alert");
  });
});

type CartTagOptions = {
  automaticDiscountLabel?: string;
  market?: ActiveMarket;
};

async function renderShell(
  cart: CartInitialData,
  options: CartTagOptions = {},
) {
  let view = await render(CartShell, {
    cart,
    market: US_MARKET,
    ...options,
  });
  await flushAsync();
  return view;
}

async function renderPage(cart: CartInitialData, options: CartTagOptions = {}) {
  let view = await render(CartPageContent, {
    cart,
    market: US_MARKET,
    ...options,
  });
  await flushAsync();
  return view;
}

async function renderProduct() {
  let { container } = await render(ProductDetails, {
    market: US_MARKET,
    menu: { items: [] },
    product: createProduct(),
    search: "",
    shopPayStoreUrl: "https://example.myshopify.com",
  });
  await flushAsync();
  return container;
}

function drawerTrigger() {
  return query(
    document,
    'button[aria-controls="cart-drawer"]',
    HTMLButtonElement,
  );
}

function cartDrawer() {
  return query(document, "#cart-drawer", HTMLDialogElement);
}
