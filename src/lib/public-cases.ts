import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const galleryTake = 30;
const brandOptionTake = 5000;
const copyKeyword = "\u30b3\u30d4\u30fc";
const maxSearchQueryLength = 80;

export type PublicCaseBrandOption = {
  value: string;
  label: string;
  caseCount: number;
};

export type B2CPublicCaseForGallery = Prisma.PublicCaseGetPayload<{
  include: {
    workItems: true;
    images: true;
  };
}>;

export type B2CPublicCaseDetail = Prisma.PublicCaseGetPayload<{
  include: {
    workItems: true;
    partItems: true;
    images: true;
  };
}>;

export type B2BPublicCaseForBizPage = Prisma.PublicCaseGetPayload<{
  include: {
    workItems: true;
    partItems: true;
    images: true;
  };
}>;

function isLocalDatabaseUrl(): boolean {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  return /(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(databaseUrl);
}

export function normalizePublicCaseSearchQuery(value?: string | null): string {
  return (value ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxSearchQueryLength);
}

export function normalizePublicCaseBrandFilter(value?: string | null): string {
  return normalizePublicCaseSearchQuery(value);
}

function buildPublicCaseSearchWhere(query: string): Prisma.PublicCaseWhereInput {
  if (!query) {
    return {};
  }

  return {
    OR: [
      { searchText: { contains: query, mode: "insensitive" } },
      { brandDisplayName: { contains: query, mode: "insensitive" } },
      { brandName: { contains: query, mode: "insensitive" } },
      { brandNameKana: { contains: query, mode: "insensitive" } },
      { modelName: { contains: query, mode: "insensitive" } },
      { ref: { contains: query, mode: "insensitive" } },
      { caliber: { contains: query, mode: "insensitive" } },
    ],
  };
}

function buildPublicCaseB2BSearchWhere(query: string): Prisma.PublicCaseWhereInput {
  if (!query) {
    return {};
  }

  return {
    OR: [
      { searchText: { contains: query, mode: "insensitive" } },
      { brandDisplayName: { contains: query, mode: "insensitive" } },
      { brandName: { contains: query, mode: "insensitive" } },
      { brandNameKana: { contains: query, mode: "insensitive" } },
      { modelName: { contains: query, mode: "insensitive" } },
      { ref: { contains: query, mode: "insensitive" } },
      { caliber: { contains: query, mode: "insensitive" } },
      {
        workItems: {
          some: {
            OR: [
              { b2bDisplayName: { contains: query, mode: "insensitive" } },
              { b2cDisplayName: { contains: query, mode: "insensitive" } },
              { normalizedWorkName: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
      {
        partItems: {
          some: {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { normalizedSourceText: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

function withPublicCaseSearch(
  where: Prisma.PublicCaseWhereInput,
  query: string,
): Prisma.PublicCaseWhereInput {
  const searchWhere = buildPublicCaseSearchWhere(query);
  if (!query) {
    return where;
  }

  return {
    AND: [where, searchWhere],
  };
}

function withPublicCaseB2BSearch(
  where: Prisma.PublicCaseWhereInput,
  query: string,
): Prisma.PublicCaseWhereInput {
  const searchWhere = buildPublicCaseB2BSearchWhere(query);
  if (!query) {
    return where;
  }

  return {
    AND: [where, searchWhere],
  };
}

function withPublicCaseBrand(
  where: Prisma.PublicCaseWhereInput,
  brand: string,
): Prisma.PublicCaseWhereInput {
  if (!brand) {
    return where;
  }

  return {
    AND: [where, { brandName: brand }],
  };
}

function withPublicCaseGalleryFilters(
  where: Prisma.PublicCaseWhereInput,
  query: string,
  brand: string,
): Prisma.PublicCaseWhereInput {
  return withPublicCaseSearch(withPublicCaseBrand(where, brand), query);
}

function containsCopyKeyword(
  publicCase: B2CPublicCaseForGallery | B2CPublicCaseDetail,
): boolean {
  const values = [
    publicCase.brandName,
    publicCase.brandNameKana,
    publicCase.brandDisplayName,
    publicCase.modelName,
    publicCase.ref,
    publicCase.caliber,
    publicCase.searchText,
    ...publicCase.workItems.flatMap((workItem) => [
      workItem.b2cDisplayName,
      workItem.b2bDisplayName,
      workItem.normalizedWorkName,
    ]),
    ...("partItems" in publicCase
      ? publicCase.partItems.flatMap((partItem) => [
          partItem.displayName,
          partItem.normalizedSourceText,
        ])
      : []),
  ];

  return values.some((value) => String(value ?? "").includes(copyKeyword));
}

async function findB2CPublicCases(
  where: Prisma.PublicCaseWhereInput,
  take = galleryTake,
) {
  const cases = await prisma.publicCase.findMany({
    where,
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ receivedDate: "desc" }, { id: "asc" }],
    take,
  });

  return cases.filter((publicCase) => !containsCopyKeyword(publicCase));
}

export async function getB2CPublicCasesForGallery(query = "", brand = "") {
  const normalizedQuery = normalizePublicCaseSearchQuery(query);
  const normalizedBrand = normalizePublicCaseBrandFilter(brand);
  const publishedCases = await findB2CPublicCases(
    withPublicCaseGalleryFilters(
      {
        b2cPublishStatus: "PUBLISHED",
        reviewStatus: "APPROVED",
        showPriceB2c: false,
      },
      normalizedQuery,
      normalizedBrand,
    ),
  );

  if (publishedCases.length > 0 || !isLocalDatabaseUrl()) {
    return publishedCases;
  }

  return findB2CPublicCases(
    withPublicCaseGalleryFilters(
      {
        sourceType: "FMP",
        showPriceB2c: false,
      },
      normalizedQuery,
      normalizedBrand,
    ),
  );
}

function toBrandOptions(cases: B2CPublicCaseForGallery[]): PublicCaseBrandOption[] {
  const optionMap = new Map<string, PublicCaseBrandOption>();

  for (const publicCase of cases) {
    const value = (publicCase.brandName ?? "").trim();
    if (!value) {
      continue;
    }

    const label = (publicCase.brandDisplayName ?? "").trim() || value;
    const current = optionMap.get(value);
    if (current) {
      current.caseCount += 1;
      if (label.includes("\uFF08") && !current.label.includes("\uFF08")) {
        current.label = label;
      }
      continue;
    }

    optionMap.set(value, {
      value,
      label,
      caseCount: 1,
    });
  }

  return Array.from(optionMap.values()).sort((a, b) => {
    if (b.caseCount !== a.caseCount) {
      return b.caseCount - a.caseCount;
    }

    return a.label.localeCompare(b.label, "ja");
  });
}

export async function getB2CBrandOptionsForGallery() {
  const publishedCases = await findB2CPublicCases(
    {
      b2cPublishStatus: "PUBLISHED",
      reviewStatus: "APPROVED",
      showPriceB2c: false,
    },
    brandOptionTake,
  );

  if (publishedCases.length > 0 || !isLocalDatabaseUrl()) {
    return toBrandOptions(publishedCases);
  }

  const fallbackCases = await findB2CPublicCases(
    {
      sourceType: "FMP",
      showPriceB2c: false,
    },
    brandOptionTake,
  );

  return toBrandOptions(fallbackCases);
}

export async function getLatestB2CPublicCasesForHome(limit = 10) {
  const publishedCases = await findB2CPublicCases(
    {
      b2cPublishStatus: "PUBLISHED",
      reviewStatus: "APPROVED",
      showPriceB2c: false,
    },
    limit,
  );

  if (publishedCases.length > 0 || !isLocalDatabaseUrl()) {
    return publishedCases;
  }

  return findB2CPublicCases(
    {
      sourceType: "FMP",
      showPriceB2c: false,
    },
    limit,
  );
}

async function findB2BPublicCases(
  where: Prisma.PublicCaseWhereInput,
  take = galleryTake,
) {
  const cases = await prisma.publicCase.findMany({
    where,
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ receivedDate: "desc" }, { id: "asc" }],
    take,
  });

  return cases.filter((publicCase) => !containsCopyKeyword(publicCase));
}

export async function getB2BPublicCasesForBizPage(query = "") {
  const normalizedQuery = normalizePublicCaseSearchQuery(query);
  const publishedCases = await findB2BPublicCases(
    withPublicCaseB2BSearch(
      {
        b2bPublishStatus: "PUBLISHED",
        reviewStatus: "APPROVED",
      },
      normalizedQuery,
    ),
  );

  if (publishedCases.length > 0 || !isLocalDatabaseUrl()) {
    return publishedCases;
  }

  return findB2BPublicCases(
    withPublicCaseB2BSearch(
      {
        sourceType: "FMP",
      },
      normalizedQuery,
    ),
  );
}

async function findB2CPublicCaseDetail(
  id: number,
  where: Prisma.PublicCaseWhereInput,
) {
  const publicCase = await prisma.publicCase.findFirst({
    where: { id, ...where },
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
    },
  });

  if (!publicCase || containsCopyKeyword(publicCase)) {
    return null;
  }

  return publicCase;
}

async function findB2BPublicCaseDetail(
  id: number,
  where: Prisma.PublicCaseWhereInput,
) {
  const publicCase = await prisma.publicCase.findFirst({
    where: { id, ...where },
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
    },
  });

  if (!publicCase || containsCopyKeyword(publicCase)) {
    return null;
  }

  return publicCase;
}

export async function getB2BPublicCaseDetail(id: string) {
  const publicCaseId = Number(id);
  if (!Number.isInteger(publicCaseId) || publicCaseId <= 0) {
    return null;
  }

  const publishedCase = await findB2BPublicCaseDetail(publicCaseId, {
    b2bPublishStatus: "PUBLISHED",
    reviewStatus: "APPROVED",
  });

  if (publishedCase || !isLocalDatabaseUrl()) {
    return publishedCase;
  }

  return findB2BPublicCaseDetail(publicCaseId, {
    sourceType: "FMP",
  });
}

export async function getB2CPublicCaseDetail(id: string) {
  const publicCaseId = Number(id);
  if (!Number.isInteger(publicCaseId) || publicCaseId <= 0) {
    return null;
  }

  const publishedCase = await findB2CPublicCaseDetail(publicCaseId, {
    b2cPublishStatus: "PUBLISHED",
    reviewStatus: "APPROVED",
    showPriceB2c: false,
  });

  if (publishedCase || !isLocalDatabaseUrl()) {
    return publishedCase;
  }

  return findB2CPublicCaseDetail(publicCaseId, {
    sourceType: "FMP",
    showPriceB2c: false,
  });
}
