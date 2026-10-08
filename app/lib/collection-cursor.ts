const MAX_CURSOR_LENGTH = 2_048;

/** A collection page cursor from `?cursor=`, or a 400 response for an oversized one. */
export function readCursor(url: URL): string | undefined | Response {
  let cursor = url.searchParams.get("cursor")?.trim() || undefined;
  if (cursor && cursor.length > MAX_CURSOR_LENGTH) {
    return new Response("Invalid cursor", { status: 400 });
  }
  return cursor;
}
