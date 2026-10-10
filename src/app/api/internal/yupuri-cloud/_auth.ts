import type { NextRequest } from "next/server";

export function cloudWorkerAuthorized(request: NextRequest): boolean | null {
  const token = process.env.N8N_INTERNAL_TOKEN;
  if (!token) return null;
  return request.headers.get("authorization") === `Bearer ${token}`;
}
