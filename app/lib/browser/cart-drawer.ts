import { marketPath, type MarketPathPrefix } from "../market.ts";
import { publishCartViewedWhenSettled } from "./analytics.ts";
import { getBrowserCartStore } from "./cart-store.ts";

export const CART_DRAWER_ID = "cart-drawer";

let openCartActionConfigured = false;
let openCartActionRetryQueued = false;

/** Opens the cart drawer, or the cart page on narrow screens. */
export function openCartDrawer() {
  if (window.matchMedia("(max-width: 809px)").matches) {
    window.location.assign(marketPath("/cart", documentMarketPathPrefix()));
    return;
  }
  let drawer = document.getElementById(CART_DRAWER_ID);
  if (drawer instanceof HTMLDialogElement && !drawer.open) {
    if (drawer.dataset.cartEmpty === "true") return;
    drawer.showModal();
    setCartTriggerExpanded(true);
    publishCartViewedWhenSettled(
      getBrowserCartStore(undefined, documentMarketPathPrefix()),
    );
  }
}

export function closeCartDrawer() {
  let drawer = document.getElementById(CART_DRAWER_ID);
  if (drawer instanceof HTMLDialogElement) {
    drawer.close();
    setCartTriggerExpanded(false);
  }
}

export function setCartTriggerExpanded(expanded: boolean) {
  document
    .querySelector(`button[aria-controls="${CART_DRAWER_ID}"]`)
    ?.setAttribute("aria-expanded", String(expanded));
}

/** The market prefix `<app-document>` writes onto `<html>`. */
export function documentMarketPathPrefix(): MarketPathPrefix {
  let value = document.documentElement.dataset.marketPrefix;
  return value === "/en-ca" ? value : "";
}

/**
 * Wires `window.Shopify.actions.openCart` (the ShopifyScripts Standard Action)
 * to the cart drawer. It is page-lifetime configuration, so it delegates to
 * the DOM helper rather than closing over component state.
 */
export function configureOpenCartAction(): boolean {
  if (openCartActionConfigured) return true;

  let openCart = window.Shopify?.actions?.openCart;
  if (openCart) {
    openCartActionConfigured = openCart.configure({
      handler: async () => openCartDrawer(),
    });
    return openCartActionConfigured;
  }

  if (!openCartActionRetryQueued && document.readyState === "loading") {
    openCartActionRetryQueued = true;
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        openCartActionRetryQueued = false;
        configureOpenCartAction();
      },
      { once: true },
    );
  }
  return false;
}
