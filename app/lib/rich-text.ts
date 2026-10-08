import { localizeInternalUrl, type MarketPathPrefix } from "./market.ts";

type RichTextJson =
  | boolean
  | number
  | string
  | null
  | RichTextJson[]
  | RichTextJsonObject;

interface RichTextJsonObject {
  [key: string]: RichTextJson;
}

export type RichTextNode = {
  bold?: boolean;
  children?: RichTextNode[];
  italic?: boolean;
  level?: number;
  listType?: string;
  type?: string;
  underline?: boolean;
  url?: string;
  value?: string;
};

/** Shopify rich-text JSON, parsed defensively; plain text becomes one paragraph. */
export function parseRichText(value: string): RichTextNode {
  try {
    let parsed: RichTextJson = JSON.parse(value);
    return parseRichTextNode(parsed) ?? { children: [] };
  } catch {
    return {
      children: [{ type: "paragraph", children: [{ type: "text", value }] }],
    };
  }
}

function parseRichTextNode(value: RichTextJson): RichTextNode | null {
  if (!isRichTextObject(value)) return null;

  let node: RichTextNode = {};
  if (value.bold === true) node.bold = true;
  if (value.italic === true) node.italic = true;
  if (value.underline === true) node.underline = true;
  if (value.level === 3) node.level = 3;
  if (isRichTextString(value.listType)) node.listType = value.listType;
  if (isRichTextString(value.type)) node.type = value.type;
  if (isRichTextString(value.url)) node.url = value.url;
  if (isRichTextString(value.value)) node.value = value.value;
  if (Array.isArray(value.children)) {
    node.children = value.children.flatMap((child) => {
      let parsedChild = parseRichTextNode(child);
      return parsedChild ? [parsedChild] : [];
    });
  }
  return node;
}

/** Internal links keep the market prefix; only http(s) and fragment links survive. */
export function safeHref(
  value: string | undefined,
  pathPrefix: MarketPathPrefix,
): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/")) return localizeInternalUrl(value, pathPrefix);
  if (value.startsWith("#")) return value;
  try {
    let url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function isRichTextObject(
  value: RichTextJson | undefined,
): value is RichTextJsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

function isRichTextString(value: RichTextJson | undefined): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}
