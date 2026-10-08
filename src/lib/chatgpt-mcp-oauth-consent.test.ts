import assert from "node:assert/strict";
import test from "node:test";
import { McpAuthorizationError } from "./chatgpt-mcp-auth";
import { decideMcpConsent, getMcpConsentDetails } from "./chatgpt-mcp-oauth-consent";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-test-key",
  MCP_RESOURCE_URL: "https://yoshidawatchrepair.com/mcp",
  MCP_OAUTH_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
  MCP_OAUTH_REDIRECT_URI: "https://chatgpt.com/aip/callback",
  MCP_ALLOWED_USER_ID: "22222222-2222-4222-8222-222222222222",
};
const authorizationId = "33333333-3333-4333-8333-333333333333";
const claims = {
  sub: env.MCP_ALLOWED_USER_ID,
  iss: "https://project.supabase.co/auth/v1",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { mcp_line_reply: true },
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function details(clientId = env.MCP_OAUTH_CLIENT_ID) {
  return {
    authorization_id: authorizationId,
    redirect_uri: "https://chatgpt.com/aip/callback",
    client: { id: clientId, name: "ChatGPT", uri: "https://chatgpt.com", logo_uri: "" },
    user: { id: env.MCP_ALLOWED_USER_ID, email: "private@example.test" },
    scope: "email",
  };
}

test("consent details expose only safe client fields and require the configured client", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(details()), { status: 200, headers: { "content-type": "application/json" } });
  const result = await getMcpConsentDetails("session", authorizationId, { env, fetchImpl, verifyClaims: async () => claims });
  assert.deepEqual(result, {
    kind: "consent",
    authorizationId,
    clientName: "ChatGPT",
    redirectUri: "https://chatgpt.com/aip/callback",
    scopes: ["email"],
  });
  assert.equal(JSON.stringify(result).includes("private@example.test"), false);

  const wrongClientFetch: typeof fetch = async () => new Response(JSON.stringify(details("other-client")), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(
    getMcpConsentDetails("session", authorizationId, { env, fetchImpl: wrongClientFetch, verifyClaims: async () => claims }),
    McpAuthorizationError,
  );
});

test("approve revalidates details before consent and only accepts redirect to the registered callback", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method === "GET") return new Response(JSON.stringify(details()), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ redirect_url: "https://chatgpt.com/aip/callback?code=abc&state=xyz" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await decideMcpConsent("session", authorizationId, "approve", { env, fetchImpl, verifyClaims: async () => claims });
  assert.equal(result.kind, "redirect");
  assert.match(result.redirectUrl, /^https:\/\/chatgpt\.com\/aip\/callback\?/);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);
});
