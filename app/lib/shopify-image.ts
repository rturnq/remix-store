const RESPONSIVE_WIDTHS = [
  320, 480, 640, 800, 960, 1200, 1600, 2000, 2400, 3000,
];
const SHOPIFY_IMAGE_HOSTS = ["cdn.shopify.com", "mock.shop"];

export function shopifyImageUrl(source: string, width: number): string {
  try {
    let url = new URL(source);
    if (!isShopifyImageHost(url.hostname)) return source;
    url.searchParams.set("width", String(Math.round(width)));
    return url.toString();
  } catch {
    return source;
  }
}

export function responsiveImageWidths(sourceWidth?: number | null): number[] {
  if (!sourceWidth || sourceWidth <= 0) return RESPONSIVE_WIDTHS;

  let maximumWidth = Math.max(1, Math.round(sourceWidth));
  let widths = RESPONSIVE_WIDTHS.filter((width) => width < maximumWidth);
  widths.push(maximumWidth);
  return [...new Set(widths)];
}

export function isShopifyImageSource(source: string): boolean {
  try {
    return isShopifyImageHost(new URL(source).hostname);
  } catch {
    return false;
  }
}

function isShopifyImageHost(hostname: string): boolean {
  return SHOPIFY_IMAGE_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}
