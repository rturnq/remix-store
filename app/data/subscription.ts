import * as v from "valibot";

export const BACK_IN_STOCK_TAG = "back-in-stock-subscriber";

export interface SubscriptionFormInput {
  consent: true;
  email: string;
  productHandle?: string;
  variantId?: string;
}

export interface SubscriptionValidationError {
  message: string;
}

const ALLOWED_FIELDS = new Set([
  "consent",
  "email",
  "product-handle",
  "variant-id",
]);
const EmailSchema = v.pipe(
  v.string(),
  v.maxLength(254),
  v.email(),
  v.check((value) => value.trim() === value),
  v.transform((value) => value.toLowerCase()),
);
const ConsentSchema = v.pipe(
  v.literal("yes"),
  v.transform((): true => true),
);
const OptionalProductValueSchema = v.union([
  v.pipe(
    v.string(),
    v.transform((value) => value || undefined),
  ),
  v.pipe(
    v.null(),
    v.transform(() => undefined),
  ),
  v.pipe(
    v.instance(Blob),
    v.transform(() => undefined),
  ),
]);
const ProductFormSchema = v.pipe(
  v.object({
    productHandle: OptionalProductValueSchema,
    variantId: OptionalProductValueSchema,
  }),
  v.check(
    ({ productHandle, variantId }) =>
      Boolean(productHandle) === Boolean(variantId) &&
      (!productHandle || /^[a-z0-9][a-z0-9-]{0,254}$/.test(productHandle)) &&
      (!variantId ||
        /^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]*$/.test(variantId)),
  ),
);

export function parseSubscriptionForm(
  form: FormData,
): SubscriptionFormInput | SubscriptionValidationError {
  for (let name of form.keys()) {
    if (!ALLOWED_FIELDS.has(name) || form.getAll(name).length !== 1) {
      return { message: "The form submission is invalid." };
    }
  }

  let emailResult = v.safeParse(EmailSchema, form.get("email"));
  if (!emailResult.success) {
    return { message: "Please enter a valid email address." };
  }
  let consentResult = v.safeParse(ConsentSchema, form.get("consent"));
  if (!consentResult.success) {
    return { message: "Please confirm that you agree to receive emails." };
  }
  let productResult = v.safeParse(ProductFormSchema, {
    productHandle: form.get("product-handle"),
    variantId: form.get("variant-id"),
  });
  if (!productResult.success) {
    return { message: "The product subscription is invalid." };
  }
  return {
    consent: consentResult.output,
    email: emailResult.output,
    productHandle: productResult.output.productHandle,
    variantId: productResult.output.variantId,
  };
}

export function isSubscriptionValidationError(
  value: SubscriptionFormInput | SubscriptionValidationError,
): value is SubscriptionValidationError {
  return "message" in value;
}

export function backInStockTags(
  productHandle: string,
  variantTitle: string,
  variantId: string,
): string[] {
  let variantNumber = variantId.split("/").at(-1)!;
  let title =
    variantTitle
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || `variant-${variantNumber}`;
  let suffix = "-back-in-stock-subscriber";
  let identity = `${productHandle}-${title}`;
  if (identity.length + suffix.length > 255) {
    let uniqueSuffix = `-${variantNumber}`;
    identity = `${identity.slice(0, 255 - suffix.length - uniqueSuffix.length)}${uniqueSuffix}`;
  }
  return [BACK_IN_STOCK_TAG, `${identity}${suffix}`];
}
