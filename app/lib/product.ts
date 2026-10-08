import {
  buildProductSelectionSearchParams,
  type ProductFormStoreState,
  type SelectedOption,
} from "@shopify/hydrogen";

import type { ImageData, ProductData } from "../data/storefront.ts";
import { marketPath, type ActiveMarket } from "./market.ts";

export type ProductVariant = NonNullable<
  ProductData["selectedOrFirstAvailableVariant"]
>;

export type ProductState = ProductFormStoreState<
  ProductVariant,
  ProductData["options"][number]["optionValues"][number]
>;

export function orderedProductImages(
  images: ImageData[],
  selectedImage: ImageData | null | undefined,
): ImageData[] {
  if (!selectedImage) return images;
  return [
    selectedImage,
    ...images.filter((image) =>
      selectedImage.id
        ? image.id !== selectedImage.id
        : image.url !== selectedImage.url,
    ),
  ];
}

export function isDefaultTitleOption(option: {
  name: string;
  values: ReadonlyArray<{ name: string }>;
}): boolean {
  return (
    option.name.trim().toLowerCase() === "title" &&
    option.values.length === 1 &&
    option.values[0]?.name.trim().toLowerCase() === "default title"
  );
}

export function serverProductOptions(product: ProductData) {
  let selectedVariant = product.selectedOrFirstAvailableVariant;

  return product.options.map((option) => ({
    name: option.name,
    values: option.optionValues.map((value) => {
      let variant =
        value.firstSelectableVariant ??
        [
          product.selectedOrFirstAvailableVariant,
          ...product.adjacentVariants,
        ].find((candidate) =>
          candidate?.selectedOptions.some(
            (selectedOption) =>
              selectedOption.name === option.name &&
              selectedOption.value === value.name,
          ),
        ) ??
        null;
      return {
        name: value.name,
        selected:
          selectedVariant?.selectedOptions.some(
            (selectedOption) =>
              selectedOption.name === option.name &&
              selectedOption.value === value.name,
          ) ?? false,
        exists: variant !== null,
        available: variant?.availableForSale ?? false,
        selectedOptions: variant?.selectedOptions ?? [],
        handle: variant?.product?.handle ?? product.handle,
      };
    }),
  }));
}

export function variantHref(
  handle: string,
  selectedOptions: ReadonlyArray<SelectedOption>,
  options: ReadonlyArray<{ name: string }>,
  currentSearch = "",
  pathPrefix: ActiveMarket["pathPrefix"] = "",
): string {
  let search = buildProductSelectionSearchParams({
    selectedOptions,
    optionNames: options.map((option) => option.name),
    base: new URLSearchParams(currentSearch),
  });
  let query = search.toString();
  return marketPath(
    `/products/${encodeURIComponent(handle)}${query ? `?${query}` : ""}`,
    pathPrefix,
  );
}

export function canAddServerVariant(product: ProductData): boolean {
  return Boolean(
    product.selectedOrFirstAvailableVariant?.availableForSale &&
    !product.requiresSellingPlan,
  );
}

const ADD_TO_CART_CHECK_MS = 600;

export function waitForAddToCartCheck(startedAt: number) {
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  let remaining = ADD_TO_CART_CHECK_MS - (Date.now() - startedAt);
  if (remaining <= 0) return;
  return new Promise<void>((resolve) => {
    setTimeout(resolve, remaining);
  });
}

export function addToCartLabel(
  product: ProductData,
  variant: ProductData["selectedOrFirstAvailableVariant"],
): string {
  if (product.requiresSellingPlan) return "Selling plan required";
  if (!variant) return "Select options";
  return variant.availableForSale ? "Add to cart" : "Sold out";
}

export function productErrorMessages(state: ProductState): string[] {
  // Cart-level discount/shipping warnings ride along on the shared cart
  // store. The product form only surfaces add-to-cart failures.
  return [
    ...new Set(
      [
        ...state.errors.userErrors.map((error) => error.message),
        ...state.errors.networkErrors.map((entry) => entry.message),
      ].filter((message) => !/discount code/i.test(message)),
    ),
  ];
}
