import { NextResponse } from "next/server";
import {
  getB2CPublicCasesPage,
  normalizePublicCaseBrandFilter,
  normalizePublicCaseSearchQuery,
  parsePublicCaseGalleryOffset,
  toGalleryCard,
} from "@/lib/public-cases";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = parsePublicCaseGalleryOffset(params.get("offset"));
  if (offset === null) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }
  const query = normalizePublicCaseSearchQuery(params.get("q"));
  const brand = normalizePublicCaseBrandFilter(params.get("brand"));
  const result = await getB2CPublicCasesPage(query, brand, offset);
  return NextResponse.json({ cases: result.cases.map(toGalleryCard), total: result.total });
}
