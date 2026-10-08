import { fetch as routerFetch } from "@marko/run/router";

import { resolveMarketPath, US_MARKET } from "./lib/market.ts";
import type { AppPlatform, Runtime } from "./runtime.ts";

/**
 * The app's Fetch boundary, shared by the Node server and the Oxygen Worker.
 * Market prefixes are resolved here because @marko/run matches routes before
 * any middleware runs, and the routes are written without the prefix.
 */
export async function handleRequest(
  request: Request,
  runtime: Runtime,
): Promise<Response> {
  try {
    let url = new URL(request.url);
    let resolution = resolveMarketPath(url.pathname);
    if (resolution.kind === "redirect") {
      let location = `${resolution.pathname}${url.search}${url.hash}`;
      return new Response(null, {
        status: 308,
        headers: { Location: location, "Cache-Control": "private, no-store" },
      });
    }

    let platform: AppPlatform = { ...runtime, market: US_MARKET };
    if (resolution.kind === "unsupported") {
      platform.unsupportedLocale = true;
    } else {
      platform.market = resolution.market;
      if (resolution.pathname !== url.pathname) {
        url.pathname = resolution.pathname;
        // Shares the body stream, which only the matched route reads.
        request = new Request(url, request);
      }
    }

    return (
      (await routerFetch(request, platform)) ??
      new Response("Not Found", { status: 404 })
    );
  } catch (error) {
    if (!(request.signal.aborted && error === request.signal.reason)) {
      console.error(error);
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
