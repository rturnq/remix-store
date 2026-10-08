import { cleanup, render } from "@marko/testing-library";
import { afterEach, assert, describe, it, onTestFinished, vi } from "vitest";

import { query } from "../../../test/browser-fixtures.ts";
import SnowField from "./index.marko";

type FrameCallback = (time: number) => void;
type MotionListener = (event: MediaQueryListEvent) => void;

type CanvasHarness = ReturnType<typeof installCanvasHarness>;

afterEach(cleanup);

describe("seasonal snow browser lifecycle", () => {
  it("keeps the static fallback and schedules no animation for reduced motion", async () => {
    let harness = installCanvasHarness({ reducedMotion: true });
    let { container } = await renderSnow();

    let overlay = query(container, "[data-seasonal-snow]", HTMLDivElement);
    let fallback = query(container, "[data-snow-static]", HTMLDivElement);
    assert.strictEqual(overlay.getAttribute("aria-hidden"), "true");
    assert.strictEqual(overlay.hasAttribute("data-snow-canvas-ready"), false);
    assert.strictEqual(overlay.hasAttribute("data-snow-reduced-motion"), true);
    assert.strictEqual(getComputedStyle(fallback).display, "block");
    assert.strictEqual(harness.contextRequests, 0);
    assert.strictEqual(harness.frames.size, 0);
  });

  it("caps DPR at 2, animates, resizes, and releases browser work", async () => {
    let harness = installCanvasHarness();
    let view = await renderSnow();
    let canvas = query(view.container, "canvas", HTMLCanvasElement);
    let overlay = query(view.container, "[data-seasonal-snow]", HTMLDivElement);

    assert.strictEqual(canvas.width, 100);
    assert.strictEqual(canvas.height, 50);
    assert.deepEqual(harness.transforms.at(-1), [1, 0, 0, 1, 0, 0]);
    assert.strictEqual(overlay.getAttribute("data-snow-canvas-ready"), "true");
    assert.strictEqual(harness.frames.size, 1);
    assert.ok(harness.arcs > 0);

    let firstFrame = takeFrame(harness);
    firstFrame(16);
    assert.strictEqual(harness.frames.size, 1);

    harness.width = 120;
    harness.height = 60;
    harness.dpr = 3;
    harness.observerCallback?.();
    assert.strictEqual(canvas.width, 240);
    assert.strictEqual(canvas.height, 120);
    assert.deepEqual(harness.transforms.at(-1), [2, 0, 0, 2, 0, 0]);

    let retainedFrame = takeFrame(harness);
    view.cleanup();
    assert.strictEqual(harness.observerDisconnected, true);
    assert.strictEqual(harness.cancelledFrames.length, 1);
    retainedFrame(32);
    harness.observerCallback?.();
    assert.strictEqual(harness.frames.size, 0);
  });

  it("switches from motion to the static fallback immediately", async () => {
    let harness = installCanvasHarness();
    let { container } = await renderSnow();

    let overlay = query(container, "[data-seasonal-snow]", HTMLDivElement);
    let fallback = query(container, "[data-snow-static]", HTMLDivElement);
    let canvas = query(container, "canvas", HTMLCanvasElement);
    assert.strictEqual(overlay.getAttribute("data-snow-canvas-ready"), "true");
    assert.strictEqual(getComputedStyle(fallback).display, "none");
    assert.strictEqual(getComputedStyle(canvas).display, "block");
    assert.strictEqual(harness.frames.size, 1);

    harness.setReducedMotion(true);

    assert.strictEqual(overlay.hasAttribute("data-snow-canvas-ready"), false);
    assert.strictEqual(overlay.hasAttribute("data-snow-reduced-motion"), true);
    assert.strictEqual(getComputedStyle(fallback).display, "block");
    assert.strictEqual(harness.frames.size, 0);
    assert.strictEqual(harness.cancelledFrames.length, 1);
    assert.strictEqual(harness.observerDisconnected, true);
  });

  it("restarts the canvas when reduced motion is disabled", async () => {
    let harness = installCanvasHarness({ reducedMotion: true });
    let { container } = await renderSnow();

    let overlay = query(container, "[data-seasonal-snow]", HTMLDivElement);
    assert.strictEqual(overlay.hasAttribute("data-snow-canvas-ready"), false);
    assert.strictEqual(harness.contextRequests, 0);

    harness.setReducedMotion(false);

    assert.strictEqual(overlay.getAttribute("data-snow-canvas-ready"), "true");
    assert.strictEqual(harness.contextRequests, 1);
    assert.strictEqual(harness.frames.size, 1);
    assert.ok(harness.arcs > 0);
  });

  it("removes its motion preference listener during cleanup", async () => {
    let harness = installCanvasHarness({ reducedMotion: true });
    let view = await renderSnow();
    assert.strictEqual(harness.motionListenerCount, 1);

    view.cleanup();

    assert.strictEqual(harness.motionListenerCount, 0);
    harness.setReducedMotion(false);
    assert.strictEqual(harness.contextRequests, 0);
    assert.strictEqual(harness.frames.size, 0);
  });

  it("leaves the static fallback intact when canvas setup fails", async () => {
    let harness = installCanvasHarness({ missingContext: true });
    let { container } = await renderSnow();

    let overlay = query(container, "[data-seasonal-snow]", HTMLDivElement);
    assert.strictEqual(overlay.hasAttribute("data-snow-canvas-ready"), false);
    assert.strictEqual(harness.contextRequests, 1);
    assert.strictEqual(harness.frames.size, 0);
    assert.strictEqual(harness.observerCallback, null);
  });
});

// The canvas double replaces requestAnimationFrame, which `act` waits on; the
// tag's effect runs as it mounts, so no flush is needed.
function renderSnow() {
  return render(SnowField);
}

function installCanvasHarness(
  options: { missingContext?: boolean; reducedMotion?: boolean } = {},
) {
  let width = 100;
  let height = 50;
  let dpr = 1;
  let contextRequests = 0;
  let arcs = 0;
  let transforms: number[][] = [];
  let frames = new Map<number, FrameCallback>();
  let nextFrame = 1;
  let cancelledFrames: number[] = [];
  let observerCallback: (() => void) | null = null;
  let observerDisconnected = false;
  let reducedMotion = options.reducedMotion ?? false;
  let motionListeners = new Set<MotionListener>();

  let contextDouble: Partial<CanvasRenderingContext2D> = {
    beginPath() {},
    clearRect() {},
    fill() {},
    fillStyle: "",
    globalAlpha: 1,
    arc() {
      arcs++;
    },
  };
  Object.defineProperty(contextDouble, "setTransform", {
    value: (...values: number[]) => transforms.push(values),
  });
  // SAFETY: SnowField only calls the canvas methods and writable properties
  // implemented by this focused browser test double.
  let context = contextDouble as CanvasRenderingContext2D;

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    contextRequests++;
    return options.missingContext ? null : context;
  });
  mockGetter(HTMLElement.prototype, "clientWidth", () => width);
  mockGetter(HTMLElement.prototype, "clientHeight", () => height);
  mockGetter(window, "devicePixelRatio", () => dpr);
  replaceProperty(
    window,
    "requestAnimationFrame",
    (callback: FrameCallback) => {
      let id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
  );
  replaceProperty(window, "cancelAnimationFrame", (id: number) => {
    cancelledFrames.push(id);
    frames.delete(id);
  });
  replaceProperty(window, "matchMedia", () => {
    let mediaQueryListDouble = {
      get matches() {
        return reducedMotion;
      },
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener(_type: string, listener: MotionListener) {
        motionListeners.add(listener);
      },
      removeEventListener(_type: string, listener: MotionListener) {
        motionListeners.delete(listener);
      },
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return true;
      },
    };
    // SAFETY: SnowField only uses the motion state and change-listener methods
    // implemented by this focused MediaQueryList test double.
    return mediaQueryListDouble as MediaQueryList;
  });
  class CanvasResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observerCallback = () => callback([], this);
    }
    observe(_target: Element, _options?: ResizeObserverOptions) {}
    unobserve(_target: Element) {}
    disconnect() {
      observerDisconnected = true;
    }
  }
  replaceProperty(globalThis, "ResizeObserver", CanvasResizeObserver);

  return {
    get arcs() {
      return arcs;
    },
    get cancelledFrames() {
      return cancelledFrames;
    },
    get contextRequests() {
      return contextRequests;
    },
    get dpr() {
      return dpr;
    },
    set dpr(value: number) {
      dpr = value;
    },
    frames,
    get height() {
      return height;
    },
    set height(value: number) {
      height = value;
    },
    get observerCallback() {
      return observerCallback;
    },
    get observerDisconnected() {
      return observerDisconnected;
    },
    get motionListenerCount() {
      return motionListeners.size;
    },
    setReducedMotion(value: boolean) {
      reducedMotion = value;
      let event = new MediaQueryListEvent("change", {
        matches: reducedMotion,
        media: "(prefers-reduced-motion: reduce)",
      });
      for (let listener of motionListeners) listener(event);
    },
    transforms,
    get width() {
      return width;
    },
    set width(value: number) {
      width = value;
    },
  };
}

function takeFrame(harness: CanvasHarness): FrameCallback {
  let entry = harness.frames.entries().next().value;
  assert.ok(entry);
  let [id, callback] = entry;
  harness.frames.delete(id);
  return callback;
}

type GetterOwner = HTMLElement | Window;

function mockGetter<Owner extends GetterOwner, Key extends keyof Owner>(
  target: Owner,
  property: Key,
  getter: () => Owner[Key],
) {
  let descriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, get: getter });
  onTestFinished(() => {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  });
}

type BrowserPropertyOwner = Window | typeof globalThis;

function replaceProperty<
  Owner extends BrowserPropertyOwner,
  Key extends keyof Owner,
>(target: Owner, property: Key, value: Owner[Key]) {
  let descriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  onTestFinished(() => {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  });
}
