import {
  McpAuthConfigurationError,
  McpAuthenticationError,
  McpAuthorizationError,
  bearerToken,
  getMcpPrivateAuthConfig,
  type McpAuthEnvironment,
  verifyConsentSessionToken,
} from "./chatgpt-mcp-auth";

export class McpConsentInputError extends Error {}
export class McpConsentUnavailableError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAuthorizationId(value: unknown) {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new McpConsentInputError("Invalid authorization id");
  return value;
}

export function parseConsentDecision(value: unknown) {
  if (value !== "approve" && value !== "deny") throw new McpConsentInputError("Invalid consent decision");
  return value;
}

type FetchLike = typeof fetch;

function safeRedirectUrl(value: unknown) {
  if (typeof value !== "string") throw new McpConsentUnavailableError("OAuth redirect missing");
  let url: URL;
  try { url = new URL(value); } catch { throw new McpConsentUnavailableError("OAuth redirect invalid"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) {
    throw new McpConsentUnavailableError("OAuth redirect scheme invalid");
  }
  return url;
}

function sameRedirectBase(expected: string, actual: URL) {
  const base = safeRedirectUrl(expected);
  return base.origin === actual.origin && base.pathname === actual.pathname;
}

async function authRequest(
  path: string,
  token: string,
  init: RequestInit,
  env: McpAuthEnvironment,
  fetchImpl: FetchLike,
) {
  const config = getMcpPrivateAuthConfig(env);
  const response = await fetchImpl(`${config.supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: config.publishableKey,
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new McpConsentUnavailableError("Supabase OAuth request failed");
  return response.json() as Promise<Record<string, unknown>>;
}

export type McpConsentDetails =
  | { kind: "consent"; authorizationId: string; clientName: string; redirectUri: string; scopes: string[] }
  | { kind: "redirect"; redirectUrl: string };

export async function getMcpConsentDetails(
  token: string,
  authorizationId: string,
  options: { env?: McpAuthEnvironment; fetchImpl?: FetchLike; verifyClaims?: (token: string) => Promise<Record<string, unknown>> } = {},
): Promise<McpConsentDetails> {
  const env = options.env ?? process.env;
  const id = parseAuthorizationId(authorizationId);
  const identity = await verifyConsentSessionToken(token, { env, verifyClaims: options.verifyClaims });
  const config = getMcpPrivateAuthConfig(env);
  const data = await authRequest(`/oauth/authorizations/${encodeURIComponent(id)}`, token, { method: "GET" }, env, options.fetchImpl ?? fetch);

  if (typeof data.redirect_url === "string") {
    const redirect = safeRedirectUrl(data.redirect_url);
    if (!sameRedirectBase(config.redirectUri, redirect)) throw new McpAuthorizationError("OAuth redirect is not allowed");
    return { kind: "redirect", redirectUrl: redirect.toString() };
  }

  const client = data.client;
  const user = data.user;
  if (data.authorization_id !== id || !client || typeof client !== "object" || Array.isArray(client) ||
      !user || typeof user !== "object" || Array.isArray(user)) {
    throw new McpConsentUnavailableError("OAuth authorization details are invalid");
  }
  const clientObject = client as Record<string, unknown>;
  const userObject = user as Record<string, unknown>;
  if (clientObject.id !== config.clientId || userObject.id !== identity.subject || data.redirect_uri !== config.redirectUri) {
    throw new McpAuthorizationError("OAuth authorization is not allowed");
  }
  if (typeof clientObject.name !== "string" || typeof data.redirect_uri !== "string" || typeof data.scope !== "string") {
    throw new McpConsentUnavailableError("OAuth authorization details are incomplete");
  }
  safeRedirectUrl(data.redirect_uri);
  return {
    kind: "consent",
    authorizationId: id,
    clientName: clientObject.name,
    redirectUri: data.redirect_uri,
    scopes: data.scope.split(/\s+/).filter(Boolean),
  };
}

export async function decideMcpConsent(
  token: string,
  authorizationId: string,
  decision: "approve" | "deny",
  options: { env?: McpAuthEnvironment; fetchImpl?: FetchLike; verifyClaims?: (token: string) => Promise<Record<string, unknown>> } = {},
) {
  const env = options.env ?? process.env;
  const id = parseAuthorizationId(authorizationId);
  const parsedDecision = parseConsentDecision(decision);
  const details = await getMcpConsentDetails(token, id, options);
  if (details.kind === "redirect") return details;

  const data = await authRequest(
    `/oauth/authorizations/${encodeURIComponent(id)}/consent`,
    token,
    { method: "POST", body: JSON.stringify({ action: parsedDecision }) },
    env,
    options.fetchImpl ?? fetch,
  );
  const redirect = safeRedirectUrl(data.redirect_url);
  const config = getMcpPrivateAuthConfig(env);
  if (!sameRedirectBase(config.redirectUri, redirect) || !sameRedirectBase(details.redirectUri, redirect)) {
    throw new McpConsentUnavailableError("OAuth redirect does not match the registered client");
  }
  return { kind: "redirect" as const, redirectUrl: redirect.toString() };
}

export function consentRouteError(error: unknown) {
  if (error instanceof McpConsentInputError) return { status: 400, code: "invalid_input" };
  if (error instanceof McpAuthenticationError) return { status: 401, code: "unauthorized" };
  if (error instanceof McpAuthorizationError) return { status: 403, code: "forbidden" };
  if (error instanceof McpAuthConfigurationError) return { status: 503, code: "unavailable" };
  if (error instanceof McpConsentUnavailableError) return { status: 409, code: "unavailable" };
  return { status: 500, code: "internal_error" };
}

export function consentBearerToken(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new McpAuthenticationError("Missing Supabase session token");
  return token;
}
