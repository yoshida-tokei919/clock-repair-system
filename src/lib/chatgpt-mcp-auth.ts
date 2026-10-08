import { createClient } from "@supabase/supabase-js";

export type McpVerifiedIdentity = {
  subject: string;
  clientId: string | null;
  expiresAt: number | null;
};

export class McpAuthConfigurationError extends Error {}
export class McpAuthenticationError extends Error {}
export class McpAuthorizationError extends Error {}

export type McpAuthEnvironment = {
  [key: string]: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  MCP_RESOURCE_URL?: string;
  MCP_OAUTH_CLIENT_ID?: string;
  MCP_OAUTH_REDIRECT_URI?: string;
  MCP_ALLOWED_USER_ID?: string;
};

type ClaimsVerifier = (token: string) => Promise<Record<string, unknown>>;

function trimmed(value: string | undefined) {
  return value?.trim() || null;
}

function normalizedUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new McpAuthConfigurationError(`${label} is invalid`);
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new McpAuthConfigurationError(`${label} must use HTTPS`);
  }
  url.hash = "";
  return url;
}

export function getMcpPublicAuthConfig(env: McpAuthEnvironment = process.env) {
  const supabaseUrlValue = trimmed(env.NEXT_PUBLIC_SUPABASE_URL);
  const resourceValue = trimmed(env.MCP_RESOURCE_URL);
  if (!supabaseUrlValue || !resourceValue) {
    throw new McpAuthConfigurationError("MCP OAuth public configuration is incomplete");
  }
  const supabaseUrl = normalizedUrl(supabaseUrlValue, "NEXT_PUBLIC_SUPABASE_URL");
  const resource = normalizedUrl(resourceValue, "MCP_RESOURCE_URL");
  supabaseUrl.pathname = supabaseUrl.pathname.replace(/\/+$/, "");
  resource.pathname = resource.pathname.replace(/\/+$/, "") || "/";
  const issuer = new URL(`${supabaseUrl.toString().replace(/\/$/, "")}/auth/v1`);
  const metadataUrl = new URL("/.well-known/oauth-protected-resource", resource.origin);
  return {
    supabaseUrl: supabaseUrl.toString().replace(/\/$/, ""),
    issuer: issuer.toString().replace(/\/$/, ""),
    resource: resource.toString().replace(/\/$/, ""),
    metadataUrl: metadataUrl.toString(),
  };
}

export function getMcpPrivateAuthConfig(env: McpAuthEnvironment = process.env) {
  const publicConfig = getMcpPublicAuthConfig(env);
  const clientId = trimmed(env.MCP_OAUTH_CLIENT_ID);
  const redirectUriValue = trimmed(env.MCP_OAUTH_REDIRECT_URI);
  const allowedUserId = trimmed(env.MCP_ALLOWED_USER_ID);
  const publishableKey = trimmed(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? trimmed(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!clientId || !redirectUriValue || !allowedUserId || !publishableKey) {
    throw new McpAuthConfigurationError("MCP OAuth private configuration is incomplete");
  }
  const redirectUri = normalizedUrl(redirectUriValue, "MCP_OAUTH_REDIRECT_URI").toString();
  return { ...publicConfig, clientId, redirectUri, allowedUserId, publishableKey };
}

export function mcpProtectedResourceMetadata(env: McpAuthEnvironment = process.env) {
  const config = getMcpPublicAuthConfig(env);
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: ["email"],
    bearer_methods_supported: ["header"],
  };
}

export function mcpWwwAuthenticate(env: McpAuthEnvironment = process.env) {
  const config = getMcpPublicAuthConfig(env);
  return `Bearer resource_metadata="${config.metadataUrl}", scope="email"`;
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function claimString(claims: Record<string, unknown>, key: string) {
  return typeof claims[key] === "string" ? claims[key] as string : null;
}

function audienceIncludes(claims: Record<string, unknown>, expected: string) {
  const audience = claims.aud;
  if (typeof audience === "string") return audience === expected;
  return Array.isArray(audience) && audience.every((item) => typeof item === "string") && audience.includes(expected);
}

function hasMcpEntitlement(claims: Record<string, unknown>) {
  const metadata = claims.app_metadata;
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && (metadata as Record<string, unknown>).mcp_line_reply === true);
}

function validateCommonClaims(claims: Record<string, unknown>, env: McpAuthEnvironment) {
  const config = getMcpPrivateAuthConfig(env);
  const subject = claimString(claims, "sub");
  if (!subject || subject !== config.allowedUserId) throw new McpAuthorizationError("OAuth subject is not allowed");
  if (claimString(claims, "iss") !== config.issuer) throw new McpAuthenticationError("OAuth issuer is invalid");
  if (claimString(claims, "role") !== "authenticated") throw new McpAuthorizationError("OAuth role is not allowed");
  if (claims.is_anonymous === true) throw new McpAuthorizationError("Anonymous OAuth sessions are not allowed");
  if (!hasMcpEntitlement(claims)) throw new McpAuthorizationError("OAuth account is not entitled for MCP LINE replies");
  const exp = typeof claims.exp === "number" ? claims.exp : null;
  if (exp !== null && exp <= Math.floor(Date.now() / 1000)) throw new McpAuthenticationError("OAuth token is expired");
  return { config, subject, expiresAt: exp };
}

export function validateMcpAccessClaims(claims: Record<string, unknown>, env: McpAuthEnvironment = process.env): McpVerifiedIdentity {
  const { config, subject, expiresAt } = validateCommonClaims(claims, env);
  const clientId = claimString(claims, "client_id");
  if (clientId !== config.clientId) throw new McpAuthorizationError("OAuth client is not allowed");
  if (!audienceIncludes(claims, config.resource)) throw new McpAuthorizationError("OAuth audience is not valid for this MCP resource");
  return { subject, clientId, expiresAt };
}

export function validateConsentSessionClaims(claims: Record<string, unknown>, env: McpAuthEnvironment = process.env): McpVerifiedIdentity {
  const { subject, expiresAt } = validateCommonClaims(claims, env);
  return { subject, clientId: claimString(claims, "client_id"), expiresAt };
}

async function defaultClaimsVerifier(token: string, env: McpAuthEnvironment): Promise<Record<string, unknown>> {
  const config = getMcpPrivateAuthConfig(env);
  const client = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) throw new McpAuthenticationError("OAuth token verification failed");
  return data.claims as unknown as Record<string, unknown>;
}

export async function verifyMcpAccessToken(
  token: string,
  options: { env?: McpAuthEnvironment; verifyClaims?: ClaimsVerifier } = {},
) {
  if (!token) throw new McpAuthenticationError("Missing OAuth access token");
  const env = options.env ?? process.env;
  const claims = options.verifyClaims ? await options.verifyClaims(token) : await defaultClaimsVerifier(token, env);
  return validateMcpAccessClaims(claims, env);
}

export async function verifyConsentSessionToken(
  token: string,
  options: { env?: McpAuthEnvironment; verifyClaims?: ClaimsVerifier } = {},
) {
  if (!token) throw new McpAuthenticationError("Missing Supabase session token");
  const env = options.env ?? process.env;
  const claims = options.verifyClaims ? await options.verifyClaims(token) : await defaultClaimsVerifier(token, env);
  return validateConsentSessionClaims(claims, env);
}


export function mcpUnavailableResponse() {
  return new Response(JSON.stringify({ error: "unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function mcpUnauthorizedResponse(env: McpAuthEnvironment = process.env) {
  try {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "www-authenticate": mcpWwwAuthenticate(env),
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
