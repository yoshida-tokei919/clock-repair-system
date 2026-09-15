function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

/**
 * Derives the origin of this HTTP request without accepting a client-supplied
 * return URL. A reverse proxy may rewrite request.url to localhost, so prefer
 * its forwarded host/protocol and otherwise use the inbound Host header.
 */
export function getRequestOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
    || firstHeaderValue(request.headers.get("host"));
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
    || fallback.protocol.slice(0, -1);

  if (!host || (protocol !== "http" && protocol !== "https")) return fallback.origin;

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return fallback.origin;
  }
}
