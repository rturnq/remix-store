import { act, cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it, vi } from "vitest";

import {
  createDeferred,
  flushAsync,
  query,
  submit,
  waitFor,
} from "../../../test/browser-fixtures.ts";
import SubscribeForm from "./index.marko";

afterEach(cleanup);

describe("subscribe form", () => {
  it("renders progressive fields and verified product identifiers", async () => {
    let { container } = await renderForm({
      action: "/subscribe",
      mode: "back-in-stock",
      productHandle: "test-product",
      variantId: "gid://shopify/ProductVariant/222",
    });

    let form = query(container, "form", HTMLFormElement);
    assert.strictEqual(form.getAttribute("method"), "post");
    assert.strictEqual(form.getAttribute("action"), "/subscribe");
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
      "gid://shopify/ProductVariant/222",
    );
    assert.strictEqual(
      container.querySelector('input[name="variant-title"]'),
      null,
    );
    let consent = query(container, 'input[name="consent"]', HTMLInputElement);
    assert.strictEqual(consent.getAttribute("type"), "hidden");
    assert.strictEqual(consent.getAttribute("value"), "yes");
  });

  it("posts the hydrated form and renders pending then success", async () => {
    let deferred = createDeferred<Response>();
    let requests: Array<{ body: URLSearchParams; input: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      assert.instanceOf(init?.body, URLSearchParams);
      requests.push({
        body: init?.body as URLSearchParams,
        input: String(input),
      });
      return deferred.promise;
    });
    let { container } = await renderForm({
      action: "/subscribe",
      mode: "newsletter",
    });
    fillForm(container);

    await act(() => submit(query(container, "form", HTMLFormElement)));
    let button = query(container, "button", HTMLButtonElement);
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(new URL(requests[0]!.input).pathname, "/subscribe");
    assert.strictEqual(requests[0]?.body.get("email"), "member@example.com");
    assert.strictEqual(requests[0]?.body.get("consent"), "yes");
    assert.strictEqual(button.textContent, "Subscribing…");
    assert.strictEqual(button.disabled, true);
    assert.strictEqual(
      container.querySelector("form")?.getAttribute("aria-busy"),
      "true",
    );

    deferred.resolve(
      Response.json({ message: "Thanks for subscribing!", success: true }),
    );
    await waitFor(() => container.querySelector('[role="status"]') !== null);

    button = query(container, "button", HTMLButtonElement);
    assert.strictEqual(
      container.querySelector('[role="status"]')?.textContent,
      "Thanks for subscribing!",
    );
    assert.instanceOf(button.querySelector("svg"), SVGElement);
    assert.strictEqual(button.disabled, true);
  });

  it("renders a server-rendered success as completed and disabled", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      throw new Error("must not fetch a completed subscription");
    });
    let { container } = await renderForm({
      action: "/subscribe",
      initialResult: { message: "Already subscribed", success: true },
      mode: "newsletter",
    });

    assert.strictEqual(
      container.querySelector('[role="status"]')?.textContent,
      "Already subscribed",
    );
    let button = query(container, "button", HTMLButtonElement);
    assert.strictEqual(button.disabled, true);
    await act(() => submit(query(container, "form", HTMLFormElement)));
    assert.strictEqual(calls, 0);
  });

  it("guards duplicate submissions while pending and after success", async () => {
    let deferred = createDeferred<Response>();
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      return deferred.promise;
    });
    let { container } = await renderForm({
      action: "/subscribe",
      mode: "newsletter",
    });
    fillForm(container);
    let form = query(container, "form", HTMLFormElement);

    await act(() => {
      submit(form);
      submit(form);
    });
    assert.strictEqual(calls, 1);

    deferred.resolve(Response.json({ message: "Subscribed", success: true }));
    await waitFor(() => container.querySelector('[role="status"]') !== null);
    await act(() => submit(form));
    assert.strictEqual(calls, 1);

    let email = query(container, 'input[name="email"]', HTMLInputElement);
    await act(() => {
      email.value = "other@example.com";
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.strictEqual(
      query(container, "button", HTMLButtonElement).disabled,
      false,
    );
  });

  it("renders server and network failures and restores controls", async () => {
    let responses: Array<Response | Error> = [
      Response.json(
        { error: "Please try later.", success: false },
        { status: 429 },
      ),
      new Error("network detail must not render"),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      let response = responses.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("Unexpected request");
      return response;
    });
    let { container } = await renderForm({
      action: "/subscribe",
      mode: "newsletter",
    });
    fillForm(container);
    let form = query(container, "form", HTMLFormElement);
    let alert = () => container.querySelector('[role="alert"]')?.textContent;

    await act(() => submit(form));
    await waitFor(() => alert() === "Please try later.");
    assert.strictEqual(
      query(container, "button", HTMLButtonElement).disabled,
      false,
    );

    await act(() => submit(form));
    await waitFor(() => alert()?.includes("Something went wrong") === true);
    assert.notMatch(alert() ?? "", /network detail/);
    assert.strictEqual(
      query(container, "button", HTMLButtonElement).disabled,
      false,
    );
  });
});

async function renderForm(
  input: Parameters<typeof render<typeof SubscribeForm>>[1],
) {
  let view = await render(SubscribeForm, input);
  await flushAsync(2);
  return view;
}

function fillForm(container: ParentNode) {
  query(container, 'input[name="email"]', HTMLInputElement).value =
    "member@example.com";
}
