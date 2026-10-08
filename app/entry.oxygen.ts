import { resolveOxygenBuyerIp } from "./buyer-ip.ts";
import { handleRequest } from "./request.ts";
import type { Env } from "./runtime.ts";

export default {
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContext,
  ): Promise<Response> {
    let response = await handleRequest(request, {
      env,
      buyerIp: resolveOxygenBuyerIp(request),
      cache: await caches.open("hydrogen"),
      waitUntil: (promise) => context.waitUntil(promise),
    });
    return response.body ? heldOpen(response, context) : response;
  },
};

/**
 * Marko flushes streamed HTML from a `setImmediate` scheduled as the last
 * chunk is read. workerd drops timers once a request's body has closed, so
 * holding the request one macrotask past the body's end lets the flush run.
 */
function heldOpen(response: Response, context: ExecutionContext): Response {
  let done!: () => void;
  let closed = new Promise<void>((resolve) => (done = resolve));
  context.waitUntil(
    closed.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
  );
  let body = response.body!.pipeThrough(
    new TransformStream({ flush: () => done(), cancel: () => done() }),
  );
  return new Response(body, response);
}
