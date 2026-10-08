import assert from "node:assert/strict";
import test from "node:test";
import {
  McpAuthenticationError,
  McpAuthorizationError,
  mcpProtectedResourceMetadata,
  mcpUnauthorizedResponse,
  validateConsentSessionClaims,
  validateMcpAccessClaims,
  verifyMcpAccessToken,
} from "./chatgpt-mcp-auth";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-test-key",
  MCP_RESOURCE_URL: "https://yoshidawatchrepair.com/mcp",
  MCP_OAUTH_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
  MCP_OAUTH_REDIRECT_URI: "https://chatgpt.com/aip/callback",
  MCP_ALLOWED_USER_ID: "22222222-2222-4222-8222-222222222222",
};
const claims = {
  sub: env.MCP_ALLOWED_USER_ID,
  iss: "https://project.supabase.co/auth/v1",
  aud: env.MCP_RESOURCE_URL,
  role: "authenticated",
  client_id: env.MCP_OAUTH_CLIENT_ID,
  app_metadata: { mcp_line_reply: true },
  exp: Math.floor(Date.now() / 1000) + 3600,
};

test("protected resource metadata advertises only the Supabase issuer and email scope", () => {
  assert.deepEqual(mcpProtectedResourceMetadata(env), {
    resource: env.MCP_RESOURCE_URL,
    authorization_servers: ["https://project.supabase.co/auth/v1"],
    scopes_supported: ["email"],
    bearer_methods_supported: ["header"],
  });
  const response = mcpUnauthorizedResponse(env);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /oauth-protected-resource/);
  assert.equal((response.headers.get("www-authenticate") ?? "").includes(env.MCP_OAUTH_CLIENT_ID), false);
});

test("MCP access claims require exact issuer audience client user and entitlement", () => {
  assert.deepEqual(validateMcpAccessClaims(claims, env), {
    subject: env.MCP_ALLOWED_USER_ID,
    clientId: env.MCP_OAUTH_CLIENT_ID,
    expiresAt: claims.exp,
  });
  assert.throws(() => validateMcpAccessClaims({ ...claims, aud: "authenticated" }, env), McpAuthorizationError);
  assert.throws(() => validateMcpAccessClaims({ ...claims, client_id: "other" }, env), McpAuthorizationError);
  assert.throws(() => validateMcpAccessClaims({ ...claims, sub: "other" }, env), McpAuthorizationError);
  assert.throws(() => validateMcpAccessClaims({ ...claims, iss: "https://attacker.example/auth/v1" }, env), McpAuthenticationError);
  assert.throws(() => validateMcpAccessClaims({ ...claims, app_metadata: {} }, env), McpAuthorizationError);
});

test("consent session accepts the same dedicated user before OAuth audience is minted", () => {
  const directSession = { ...claims, aud: "authenticated", client_id: undefined };
  assert.deepEqual(validateConsentSessionClaims(directSession, env), {
    subject: env.MCP_ALLOWED_USER_ID,
    clientId: null,
    expiresAt: claims.exp,
  });
});

test("token verification is delegated to a verifier and then all MCP claims are rechecked", async () => {
  const identity = await verifyMcpAccessToken("token", { env, verifyClaims: async () => claims });
  assert.equal(identity.clientId, env.MCP_OAUTH_CLIENT_ID);
  await assert.rejects(
    verifyMcpAccessToken("token", { env, verifyClaims: async () => ({ ...claims, aud: "authenticated" }) }),
    McpAuthorizationError,
  );
});
