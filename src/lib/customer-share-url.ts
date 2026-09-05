export function buildCustomerShareUrl(
  path: string,
  requestUrl: string,
  configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL
) {
  const appBaseUrl = configuredAppUrl?.trim().replace(/\/+$/, "") || new URL(requestUrl).origin;

  return new URL(path, appBaseUrl).toString();
}
