import { act } from "@marko/testing-library";
import { assert, onTestFinished, vi } from "vitest";

import type { SerializedCartData } from "../app/data/cart.ts";

/** Lets Marko flush effects and updates queued by settled promises. */
export async function flushAsync(rounds = 5): Promise<void> {
  for (let index = 0; index < rounds; index++) {
    await Promise.resolve();
    await act(() => {});
  }
}

export async function waitFor(
  predicate: () => boolean,
  label = "browser interaction",
): Promise<void> {
  let deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await act(() => {});
  }
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

export function query<T extends Element>(
  root: ParentNode,
  selector: string,
  type: abstract new (...args: never[]) => T,
): T {
  let element = root.querySelector(selector);
  assert.ok(element instanceof type, `Expected ${selector}`);
  return element;
}

export function submit(form: HTMLFormElement): void {
  form.dispatchEvent(
    new SubmitEvent("submit", { bubbles: true, cancelable: true }),
  );
}

export type CartUpdatePayload = {
  discountCodes?: string[];
  lines?: Array<{ id?: string; merchandiseId?: string; quantity: number }>;
  note?: string;
};

export type CartEndpointResult = {
  cart: SerializedCartData | null;
  userErrors?: Array<{ code?: string; field?: string[]; message: string }>;
  warnings?: Array<{ code?: string; message: string; target?: string }>;
};

type UpdateCartOptions = {
  signal?: AbortSignal;
  event?: {
    context?: "product" | "cart" | "dialog" | "standard-action";
    detail?: { source?: string };
  };
};

type UpdateCartConfig = {
  eventTarget(meta: {
    type: string;
    action?: "add" | "remove" | "update";
  }): EventTarget | null;
  handler(
    defaultHandler: () => Promise<CartEndpointResult>,
    payload: CartUpdatePayload,
    options?: UpdateCartOptions,
  ): Promise<CartEndpointResult>;
};

type OpenCartConfig = {
  handler?(defaultHandler: () => Promise<void>): Promise<void>;
};

/**
 * Installs the ShopifyScripts Standard Actions the cart store configures, so
 * cart updates run through the app's handler as they do on the storefront.
 */
export function installShopifyActions(): void {
  let updateCartConfig: UpdateCartConfig | undefined;
  let openCartConfig: OpenCartConfig | undefined;

  async function updateCart(
    payload: CartUpdatePayload,
    options?: UpdateCartOptions,
  ): Promise<CartEndpointResult> {
    if (!updateCartConfig) throw new Error("updateCart was not configured");
    let resultPromise = updateCartConfig.handler(
      async () => {
        throw new Error("The test Standard Action requires an app handler");
      },
      payload,
      options,
    );

    let line = payload.lines?.[0];
    if (line) {
      let action: "add" | "remove" | "update" = line.merchandiseId
        ? "add"
        : line.quantity === 0
          ? "remove"
          : "update";
      let event = new Event("shopify:cart:lines-update");
      Object.assign(event, {
        action,
        context: options?.event?.context ?? "standard-action",
        detail: options?.event?.detail,
        lines: payload.lines,
        promise: resultPromise.then((result) => ({
          ...result,
          cart: result.cart
            ? { ...result.cart, lines: result.cart.lines.nodes }
            : null,
        })),
      });
      updateCartConfig
        .eventTarget({ type: "shopify:cart:lines-update", action })
        ?.dispatchEvent(event);
    }
    return resultPromise;
  }
  Object.assign(updateCart, {
    configure(config: UpdateCartConfig) {
      updateCartConfig = config;
      return true;
    },
    isDefault: () => false,
  });

  async function openCart(): Promise<void> {
    if (openCartConfig?.handler) return openCartConfig.handler(async () => {});
  }
  Object.assign(openCart, {
    configure(config: OpenCartConfig) {
      openCartConfig = config;
      return true;
    },
    isDefault: () => false,
  });

  Object.defineProperty(window, "Shopify", {
    configurable: true,
    value: {
      actions: { getCart: async () => ({ cart: null }), openCart, updateCart },
    },
  });
}

export type PublishedEvent = {
  event: string;
  payload: { cart?: { updatedAt: string } | null; [key: string]: unknown };
};

/** Records what the app publishes to `window.Shopify.analytics`. */
export function useAnalyticsSpy(): PublishedEvent[] {
  let events: PublishedEvent[] = [];
  let original = Object.getOwnPropertyDescriptor(window, "Shopify");
  let shopify = window.Shopify;
  let analytics = {
    publish(event: string, payload: PublishedEvent["payload"] = {}) {
      events.push({ event, payload });
    },
    addDestination: () => () => {},
    getConfig: () => ({
      shop: {
        channel: "hydrogen" as const,
        shopId: "gid://shopify/Shop/test",
        storefrontId: "0",
      },
      consent: { mode: "default-banner" as const },
    }),
  };
  Object.defineProperty(window, "Shopify", {
    configurable: true,
    value: { ...shopify, analytics },
  });
  onTestFinished(() => {
    if (original) Object.defineProperty(window, "Shopify", original);
    else Reflect.deleteProperty(window, "Shopify");
  });
  return events;
}

/** Treats the viewport as desktop, where the cart opens as a drawer. */
export function useDesktopViewport(): void {
  let matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => {
    let result = matchMedia(media);
    if (media !== "(max-width: 809px)") return result;
    return {
      matches: false,
      media: result.media,
      onchange: result.onchange,
      addEventListener: result.addEventListener.bind(result),
      addListener: result.addListener.bind(result),
      dispatchEvent: result.dispatchEvent.bind(result),
      removeEventListener: result.removeEventListener.bind(result),
      removeListener: result.removeListener.bind(result),
    };
  });
}

type DeferredMutation = {
  readonly aborted: boolean;
  resolve(result: CartEndpointResult): void;
};

/** Answers cart API requests one queued result at a time. */
export function createCartApiMock() {
  let requests: Array<{ body: CartUpdatePayload; signal?: AbortSignal }> = [];
  let queued: Array<
    ReturnType<typeof createDeferred<CartEndpointResult>> & {
      signal?: AbortSignal;
    }
  > = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    let deferred = queued.shift();
    if (!deferred) throw new Error("Unexpected cart API request");
    let body = JSON.parse(String(init?.body)) as CartUpdatePayload;
    let signal = init?.signal ?? undefined;
    deferred.signal = signal;
    requests.push({ body, signal });
    let result = await withAbort(deferred.promise, signal);
    return Response.json(result);
  });

  return {
    requests,
    enqueue(): DeferredMutation {
      let deferred: ReturnType<typeof createDeferred<CartEndpointResult>> & {
        signal?: AbortSignal;
      } = createDeferred<CartEndpointResult>();
      queued.push(deferred);
      return {
        get aborted() {
          return deferred.signal?.aborted ?? false;
        },
        resolve: deferred.resolve,
      };
    },
  };
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    let abort = () =>
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
