import type { CartDataFromHandlers, CartGetData } from "@shopify/hydrogen";

import type { cartHandlers } from "./cart.server.ts";

type HydrogenCartData = CartDataFromHandlers<typeof cartHandlers>;

export type SerializedCartData = HydrogenCartData;
export type CartInitialData = CartGetData<HydrogenCartData>;
