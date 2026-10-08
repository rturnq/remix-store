import {
  createCartFormRegister,
  formatMoney,
  type CartData,
  type CartErrorGroup,
  type CartErrorState,
  type CartState,
  type CartStore,
  type MoneyV2,
} from "@shopify/hydrogen";

import type { CartInitialData } from "../data/cart.ts";
import type { MarketLocale } from "./market.ts";

export type CartViewState = {
  cart: CartData | null;
  errors?: CartErrorState;
  loading: boolean;
  state?: CartState;
};

export const register = createCartFormRegister();

/** Hydrogen's form attributes use React prop names (`readOnly`, `inputMode`). */
export function htmlAttributes(
  attributes: object,
): Record<string, string | boolean> {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );
}

/** The store's state once it has loaded, else the server's cart. */
export function resolveCartViewState(
  state?: CartState,
  initialData?: CartInitialData,
): CartViewState {
  if (state && (!state.loading || initialData === undefined)) {
    return {
      cart: state.data.id === null ? null : state.data,
      errors: state.errors,
      loading: state.loading,
      state,
    };
  }
  if (initialData !== undefined) {
    return { cart: initialData.cart, loading: false, state };
  }
  return {
    cart: null,
    errors: state?.errors,
    loading: state?.loading ?? true,
    state,
  };
}

export function cartDialogTitle(viewState: CartViewState): string {
  let quantity = viewState.cart?.totalQuantity;
  if (!quantity) return viewState.loading ? "Loading cart" : "Your cart";
  return `${quantity} item(s) in cart`;
}

type CartDiscountAllocationData = {
  __typename?: string;
  discountedAmount: MoneyV2;
};

type CartLineWithDiscountAllocations = CartData["lines"]["nodes"][number] & {
  discountAllocations?: CartDiscountAllocationData[];
};

export function getCartDiscountAllocation(cart: CartData): MoneyV2 | null {
  let allocations = cart.lines.nodes
    .flatMap((line) => {
      // SAFETY: The app cart fragment selects `discountAllocations`; Hydrogen's
      // open cart line type does not retain custom fragment extension fields.
      let lineWithAllocations = line as CartLineWithDiscountAllocations;
      return lineWithAllocations.discountAllocations ?? [];
    })
    .filter(
      (allocation) =>
        allocation.__typename === "CartAutomaticDiscountAllocation",
    );
  let first = allocations[0]?.discountedAmount;
  if (!first) return null;

  let amount = allocations.reduce(
    (total, allocation) => total + Number(allocation.discountedAmount.amount),
    0,
  );
  return amount > 0
    ? { amount: String(amount), currencyCode: first.currencyCode }
    : null;
}

export function getLineCompareAtPrice(
  line: CartData["lines"]["nodes"][number],
): MoneyV2 | null {
  let compareAtPrice = line.cost.compareAtAmountPerQuantity;
  if (!compareAtPrice) return null;

  let compareAtAmount = Number(compareAtPrice.amount);
  let selectedAmount = Number(line.cost.amountPerQuantity.amount);
  if (!Number.isFinite(compareAtAmount) || compareAtAmount <= selectedAmount) {
    return null;
  }
  return compareAtPrice;
}

export function getErrorGroupMessages(group?: CartErrorGroup): string[] {
  if (!group) return [];
  return [
    ...group.userErrors.map((error) => error.message),
    ...group.warnings.map((warning) => warning.message),
  ];
}

export function getBannerMessages(
  errors: CartErrorState,
  visibleLineIds: string[],
): string[] {
  let lineIds = new Set(visibleLineIds);
  let messages = [
    ...errors.network.map((error) => error.message),
    ...getErrorGroupMessages(errors.cart),
    ...getErrorGroupMessages(errors.note),
  ];

  for (let [lineId, group] of errors.lines) {
    if (!lineIds.has(lineId)) messages.push(...getErrorGroupMessages(group));
  }
  for (let group of errors.discountCodes.values()) {
    messages.push(...getErrorGroupMessages(group));
  }

  return Array.from(new Set(messages));
}

export function money(value: MoneyV2, locale: MarketLocale): string {
  return formatMoney(value, { locale }).toString();
}

/**
 * Returns `true` when the cart store (or a raw state) has in-flight optimistic
 * work that has not yet been confirmed by the server.
 *
 * Accepts either a `CartStore` or a `CartState` so every call site can use one
 * helper instead of re-deriving the same pending check.
 */
export function hasPendingCartWork(
  source: CartState | CartStore | undefined,
): boolean {
  let state: CartState | undefined;
  if (source === undefined) {
    state = undefined;
  } else if ("getState" in source) {
    state = source.getState();
  } else {
    state = source;
  }
  if (!state) return false;
  let pendingCost =
    state.pending.cost ??
    (state.pending.lines.size > 0 || state.pending.discountCodes.size > 0);
  return (
    state.revalidating === true ||
    pendingCost ||
    state.pending.note ||
    state.pending.attributes
  );
}
