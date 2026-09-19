import type { NextRequest } from "next/server";

export function isN8nAuthorized(request: NextRequest) {
  const token = process.env.N8N_INTERNAL_TOKEN;
  if (!token) return null;
  return request.headers.get("authorization") === `Bearer ${token}`;
}
