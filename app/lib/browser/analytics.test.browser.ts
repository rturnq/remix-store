import {
  AnalyticsEvent,
  type CartData,
  type CartState,
  type CartStore,
} from "@shopify/hydrogen";
import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it } from "vitest";

import CollectionViewed from "../../tags/collection-viewed/index.marko";
import ProductViewed from "../../tags/product-viewed/index.marko";
import { createCart } from "../../../test/cart-fixtures.ts";
import { useAnalyticsSpy, waitFor } from "../../../test/browser-fixtures.ts";
import {
  publishCartViewed,
  publishCartViewedWhenSettled,
  publishPageViewed,
} from "./analytics.ts";

afterEach(cleanup);

describe("storefront analytics", () => {
  it("publishes the document's page view", async () => {
    let events = useAnalyticsSpy();

    await publishPageViewed();

    assert.deepEqual(events, [
      {
        event: AnalyticsEvent.PAGE_VIEWED,
        payload: { url: window.location.href },
      },
    ]);
  });

  it("publishes a product view when the page renders", async () => {
    let events = useAnalyticsSpy();
    let product = analyticsProduct("1", "1");

    await render(ProductViewed, { product });
    await waitFor(() => events.length > 0, "the product view");

    assert.deepEqual(events, [
      {
        event: AnalyticsEvent.PRODUCT_VIEWED,
        payload: { products: [product] },
      },
    ]);
  });

  it("publishes a collection view when the page renders", async () => {
    let events = useAnalyticsSpy();
    let collection = { id: "gid://shopify/Collection/1", handle: "all" };

    await render(CollectionViewed, { collection });
    await waitFor(() => events.length > 0, "the collection view");

    assert.deepEqual(events, [
      { event: AnalyticsEvent.COLLECTION_VIEWED, payload: { collection } },
    ]);
  });

  it("publishes a cart view from confirmed store state", () => {
    let events = useAnalyticsSpy();
    let cart = createCart();
    let store = testCartStore(() => cartState(cart));

    publishCartViewed(store);

    assert.strictEqual(events[0]?.event, AnalyticsEvent.CART_VIEWED);
    let payload = events[0]?.payload;
    assert.ok(payload && "cart" in payload);
    assert.strictEqual(payload.cart?.updatedAt, cart.updatedAt);
  });

  it("defers a cart view until pending cart work settles", () => {
    let events = useAnalyticsSpy();
    let currentCart = createCart();
    let currentState = pendingCartState(currentCart);
    let listener: ((state: CartState) => void) | undefined;
    let store = testCartStore(
      () => currentState,
      (next: (state: CartState) => void) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
    );

    publishCartViewedWhenSettled(store);
    assert.strictEqual(events.length, 0);
    assert.notStrictEqual(listener, undefined);

    currentCart = createCart(2);
    currentCart.updatedAt = "2026-01-01T00:00:01.000Z";
    currentState = pendingCartState(currentCart);
    listener?.(currentState);
    assert.strictEqual(events.length, 0);

    currentState = { ...cartState(currentCart), revalidating: true };
    listener?.(currentState);
    assert.strictEqual(events.length, 0);

    currentState = cartState(currentCart);
    listener?.(currentState);

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.event, AnalyticsEvent.CART_VIEWED);
    let payload = events[0]?.payload;
    assert.ok(payload && "cart" in payload);
    assert.strictEqual(payload.cart?.updatedAt, currentCart.updatedAt);
    assert.strictEqual(listener, undefined);
  });

  it("keeps only the latest deferred cart view", () => {
    let events = useAnalyticsSpy();
    let currentState = pendingCartState(createCart());
    let listeners = new Set<(state: CartState) => void>();
    let store = testCartStore(
      () => currentState,
      (next: (state: CartState) => void) => {
        listeners.add(next);
        return () => listeners.delete(next);
      },
    );

    publishCartViewedWhenSettled(store);
    publishCartViewedWhenSettled(store);
    assert.strictEqual(listeners.size, 1);

    currentState = cartState(createCart());
    for (let listener of listeners) listener(currentState);

    assert.deepEqual(
      events.map(({ event }) => event),
      [AnalyticsEvent.CART_VIEWED],
    );
  });
});

function analyticsProduct(productId: string, variantId: string) {
  return {
    id: `gid://shopify/Product/${productId}`,
    title: `Test product ${productId}`,
    price: "20.00",
    vendor: "Test vendor",
    variantId: `gid://shopify/ProductVariant/${variantId}`,
    variantTitle: `Variant ${variantId}`,
    quantity: 1,
    sku: `SKU-${variantId}`,
  };
}

function pendingCartState(cart: CartData): CartState {
  let state = cartState(cart);
  return {
    ...state,
    pending: {
      ...state.pending,
      lines: new Set([cart.lines.nodes[0]?.id ?? "pending-line"]),
    },
  };
}

function cartState(cart: CartData): CartState {
  return {
    data: cart,
    loading: false,
    pending: {
      lines: new Set(),
      note: false,
      attributes: false,
      discountCodes: new Set(),
    },
    errors: {
      cart: { userErrors: [], warnings: [] },
      lines: new Map(),
      note: { userErrors: [], warnings: [] },
      attributes: new Map(),
      discountCodes: new Map(),
      network: [],
      lastUpdatedAt: 0,
      cartUpdatedAt: 0,
      linesUpdatedAt: 0,
      noteUpdatedAt: 0,
      attributesUpdatedAt: 0,
      discountCodesUpdatedAt: 0,
      networkUpdatedAt: 0,
    },
  };
}

function testCartStore(
  getState: () => CartState,
  subscribe: CartStore["subscribe"] = () => () => {},
): CartStore {
  return {
    connect() {},
    destroy() {},
    hydrate() {},
    getState,
    subscribe,
    fetch: () => Promise.resolve(),
    refresh() {},
    reset() {},
    handleFormSubmit: () => Promise.resolve(),
  };
}
