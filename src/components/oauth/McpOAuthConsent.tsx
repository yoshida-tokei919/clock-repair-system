"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

type ConsentDetails =
  | { kind: "consent"; authorizationId: string; clientName: string; redirectUri: string; scopes: string[] }
  | { kind: "redirect"; redirectUrl: string };

async function callConsentApi(path: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; item?: ConsentDetails; error?: string } | null;
  if (!response.ok || !payload?.ok || !payload.item) throw new Error(payload?.error ?? "unavailable");
  return payload.item;
}

export function McpOAuthConsent({ authorizationId }: { authorizationId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [details, setDetails] = useState<Extract<ConsentDetails, { kind: "consent" }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const item = await callConsentApi("/api/oauth/consent/details", token, { authorizationId });
      if (item.kind === "redirect") {
        window.location.assign(item.redirectUrl);
        return;
      }
      setDetails(item);
      setAccessToken(token);
    } catch {
      setDetails(null);
      setAccessToken(null);
      setError("????????????????MCP???????????????????");
    } finally {
      setLoading(false);
    }
  }, [authorizationId]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.access_token) void loadDetails(data.session.access_token);
      else setLoading(false);
    });
    return () => { active = false; };
  }, [loadDetails]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setPassword("");
    if (signInError || !data.session?.access_token) {
      setError("?????????????");
      setLoading(false);
      return;
    }
    await loadDetails(data.session.access_token);
  }

  async function decide(decision: "approve" | "deny") {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const item = await callConsentApi("/api/oauth/consent/decision", accessToken, { authorizationId, decision });
      if (item.kind !== "redirect") throw new Error("invalid response");
      window.location.assign(item.redirectUrl);
    } catch {
      setError("???????????????????????????????????");
      setLoading(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-600">?????????????</p>;

  if (!accessToken || !details) {
    return (
      <form onSubmit={signIn} className="space-y-4">
        <p className="text-sm text-gray-600">ChatGPT??MCP???????????????????</p>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mcp-oauth-email">???????</label>
          <input id="mcp-oauth-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mcp-oauth-password">?????</label>
          <input id="mcp-oauth-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded border px-3 py-2" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">????</button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded border bg-gray-50 p-4 text-sm">
        <p><span className="font-medium">???:</span> {details.clientName}</p>
        <p className="mt-2 break-all"><span className="font-medium">???:</span> {details.redirectUri}</p>
        <p className="mt-2"><span className="font-medium">????:</span> {details.scopes.length ? details.scopes.join(", ") : "????"}</p>
      </div>
      <p className="text-sm text-gray-700">??????ChatGPT??LINE??????????????????????????????????????????????LINE?????ChatGPT??????????????????</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => void decide("approve")} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">????</button>
        <button type="button" onClick={() => void decide("deny")} className="rounded border px-4 py-2 text-sm font-medium">?????</button>
      </div>
      <button type="button" className="text-xs text-gray-500 underline" onClick={() => void supabase.auth.signOut().then(() => { setAccessToken(null); setDetails(null); })}>MCP??????????????</button>
    </div>
  );
}
