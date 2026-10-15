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

export type B2CRelatedPublicCase = Prisma.PublicCaseGetPayload<{
  include: {
    workItems: true;
    partItems: true;
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

type PublicCaseCopyKeywordCandidate = {
  brandName: string | null;
  brandNameKana: string | null;
  brandDisplayName: string | null;
  modelName: string | null;
  ref: string | null;
  caliber: string | null;
  searchText: string | null;
  workItems: Array<{
    b2cDisplayName: string | null;
    b2bDisplayName: string | null;
    normalizedWorkName: string | null;
  }>;
  partItems?: Array<{
    displayName: string | null;
    normalizedSourceText: string | null;
  }>;
};

function containsCopyKeyword(publicCase: PublicCaseCopyKeywordCandidate): boolean {
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
    ...(publicCase.partItems?.flatMap((partItem) => [
          partItem.displayName,
          partItem.normalizedSourceText,
        ]) ?? []),
  ];

  return values.some((value) => String(value ?? "").includes(copyKeyword));
}

function buildPublicCaseCopyKeywordWhere(): Prisma.PublicCaseWhereInput {
  const containsCopy = { contains: copyKeyword, not: null };
  const containsCopyRequired = { contains: copyKeyword };
  return {
    OR: [
      { brandName: containsCopy },
      { brandNameKana: containsCopy },
      { brandDisplayName: containsCopy },
      { modelName: containsCopy },
      { ref: containsCopy },
      { caliber: containsCopy },
      { searchText: containsCopy },
      {
        workItems: {
          some: {
            OR: [
              { b2cDisplayName: containsCopy },
              { b2bDisplayName: containsCopy },
              { normalizedWorkName: containsCopy },
            ],
          },
        },
      },
      {
        partItems: {
          some: {
            OR: [
              { displayName: containsCopy },
              { normalizedSourceText: containsCopyRequired },
            ],
          },
        },
      },
    ],
  };
}

function normalizeRelatedValue(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function getVisibleRelatedWorkNames(publicCase: Pick<B2CRelatedPublicCase, "workItems">): string[] {
  return publicCase.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) =>
      (
        workItem.b2cDisplayName?.trim() ||
        workItem.b2bDisplayName?.trim() ||
        workItem.normalizedWorkName?.trim() ||
        ""
      )
        .replace(/技術料/g, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

export async function getRelatedB2CPublicCases(
  currentCase: B2CPublicCaseDetail,
): Promise<B2CRelatedPublicCase[]> {
  const commonWhere: Prisma.PublicCaseWhereInput = {
    id: { not: currentCase.id },
    showPriceB2c: false,
    NOT: buildPublicCaseCopyKeywordWhere(),
  };
  let baseWhere: Prisma.PublicCaseWhereInput;
  if (
    currentCase.b2cPublishStatus === "PUBLISHED" &&
    currentCase.reviewStatus === "APPROVED" &&
    currentCase.showPriceB2c === false
  ) {
    baseWhere = {
      ...commonWhere,
      b2cPublishStatus: "PUBLISHED",
      reviewStatus: "APPROVED",
    };
  } else if (
    isLocalDatabaseUrl() &&
    currentCase.sourceType === "FMP" &&
    currentCase.showPriceB2c === false
  ) {
    baseWhere = { ...commonWhere, sourceType: "FMP" };
  } else {
    return [];
  }

  const modelName = currentCase.modelName?.trim() ?? "";
  const caliber = currentCase.caliber?.trim() ?? "";
  const brandName = currentCase.brandName?.trim() ?? "";
  const currentWorkNames = new Set(getVisibleRelatedWorkNames(currentCase));
  const signals: Prisma.PublicCaseWhereInput[] = [];

  if (modelName) {
    signals.push({ modelName: { contains: modelName, mode: "insensitive" } });
  }
  if (caliber) {
    signals.push({ caliber: { contains: caliber, mode: "insensitive" } });
  }
  if (brandName) {
    signals.push({ brandName: { contains: brandName, mode: "insensitive" } });
  }
  if (currentWorkNames.size > 0) {
    signals.push({
      workItems: {
        some: {
          isPublishable: true,
        },
      },
    });
  }
  if (signals.length === 0) {
    return [];
  }

  const modelKey = normalizeRelatedValue(modelName);
  const caliberKey = normalizeRelatedValue(caliber);
  const brandKey = normalizeRelatedValue(brandName);

  const candidates = await prisma.publicCase.findMany({
    where: { AND: [baseWhere, { OR: signals }] },
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ receivedDate: "desc" }, { id: "asc" }],
    take: 50,
  });

  return candidates
    .filter((candidate) => !containsCopyKeyword(candidate))
    .map((candidate) => {
      const candidateWorkNames = getVisibleRelatedWorkNames(candidate);
      const score =
        (modelKey && normalizeRelatedValue(candidate.modelName) === modelKey ? 8 : 0) +
        (caliberKey && normalizeRelatedValue(candidate.caliber) === caliberKey ? 4 : 0) +
        (brandKey && normalizeRelatedValue(candidate.brandName) === brandKey ? 2 : 0) +
        (candidateWorkNames.some((name) => currentWorkNames.has(name)) ? 1 : 0);
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.candidate.receivedDate?.getTime() ?? 0) -
          (a.candidate.receivedDate?.getTime() ?? 0) ||
        a.candidate.id - b.candidate.id,
    )
    .slice(0, 6)
    .map(({ candidate }) => candidate);
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

export function buildB2CGalleryWhere(query = "", brand = ""): Prisma.PublicCaseWhereInput {
  const normalizedQuery = normalizePublicCaseSearchQuery(query);
  const normalizedBrand = normalizePublicCaseBrandFilter(brand);
  return withPublicCaseGalleryFilters({
    showPriceB2c: false,
    NOT: buildPublicCaseCopyKeywordWhere(),
    ...(isLocalDatabaseUrl()
      ? { OR: [
          { b2cPublishStatus: "PUBLISHED" as const, reviewStatus: "APPROVED" as const },
          { sourceType: "FMP" as const },
        ] }
      : { b2cPublishStatus: "PUBLISHED" as const, reviewStatus: "APPROVED" as const }),
  }, normalizedQuery, normalizedBrand);
}

export async function getB2CPublicCasesPage(query = "", brand = "", offset = 0) {
  const where = buildB2CGalleryWhere(query, brand);
  const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? Math.min(offset, 100000) : 0;
  const [total, cases] = await prisma.$transaction([
    prisma.publicCase.count({ where }),
    prisma.publicCase.findMany({
      where,
      include: {
        workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ receivedDate: "desc" }, { id: "asc" }],
      skip: safeOffset,
      take: galleryTake,
    }),
  ]);
  return { total, cases };
}

export async function getB2CPublishedCaseCount() {
  return prisma.publicCase.count({ where: buildB2CGalleryWhere() });
}

export async function getB2CPublicCasesForGallery(query = "", brand = "") {
  return (await getB2CPublicCasesPage(query, brand)).cases;
}

export function toGalleryCard(publicCase: B2CPublicCaseForGallery) {
  return {
    id: publicCase.id,
    brandDisplayName: publicCase.brandDisplayName,
    brandName: publicCase.brandName,
    modelName: publicCase.modelName,
    ref: publicCase.ref,
    caliber: publicCase.caliber,
    workItems: publicCase.workItems.map((item) => ({
      id: item.id,
      isPublishable: item.isPublishable,
      b2cDisplayName: item.b2cDisplayName,
      b2bDisplayName: item.b2bDisplayName,
    })),
    images: publicCase.images.slice(0, 1).map((image) => ({ url: image.url })),
  };
}

export type GalleryCard = ReturnType<typeof toGalleryCard>;

export type PublicCaseBizFilters = {
  q: string;
  brand: string;
  model: string;
  ref: string;
  cal: string;
  work: string;
};

export function normalizePublicCasePage(value?: string | null): number {
  const parsed = Number(value);
  return value && /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, 100000)
    : 1;
}

export function normalizePublicCasePageSize(value?: string | null): 30 | 50 | 100 {
  return value === "50" ? 50 : value === "100" ? 100 : 30;
}

export function parsePublicCaseGalleryOffset(value: string | null): number | null {
  if (value === null) return 0;
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100000) return null;
  return Number(value);
}

export function buildPublicCaseBizWhere(filters: PublicCaseBizFilters): Prisma.PublicCaseWhereInput {
  const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
  const clauses: Prisma.PublicCaseWhereInput[] = [
    withPublicCaseB2BSearch({}, filters.q),
  ];
  if (filters.brand) clauses.push({ OR: [
    { brandName: contains(filters.brand) },
    { brandDisplayName: contains(filters.brand) },
    { brandNameKana: contains(filters.brand) },
  ] });
  if (filters.model) clauses.push({ modelName: contains(filters.model) });
  if (filters.ref) clauses.push({ ref: contains(filters.ref) });
  if (filters.cal) clauses.push({ caliber: contains(filters.cal) });
  if (filters.work) clauses.push({ OR: [
    { searchText: contains(filters.work) },
    { workItems: { some: { OR: [
      { b2bDisplayName: contains(filters.work) },
      { b2cDisplayName: contains(filters.work) },
      { normalizedWorkName: contains(filters.work) },
    ] } } },
    { partItems: { some: { OR: [
      { displayName: contains(filters.work) },
      { normalizedSourceText: contains(filters.work) },
    ] } } },
  ] });
  return { AND: clauses };
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
  if (isLocalDatabaseUrl()) {
    const [webAppCases, fmpCases] = await Promise.all([
      findB2CPublicCases({
        sourceType: "WEB_APP",
        b2cPublishStatus: "PUBLISHED",
        reviewStatus: "APPROVED",
        showPriceB2c: false,
      }, brandOptionTake),
      findB2CPublicCases({ sourceType: "FMP", showPriceB2c: false }, brandOptionTake),
    ]);
    return toBrandOptions([...webAppCases, ...fmpCases]);
  }

  const publishedCases = await findB2CPublicCases(
    {
      b2cPublishStatus: "PUBLISHED",
      reviewStatus: "APPROVED",
      showPriceB2c: false,
    },
    brandOptionTake,
  );

  return toBrandOptions(publishedCases);
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

export async function getB2BPublicCasesForBizPage(
  filters: PublicCaseBizFilters,
  requestedPage = 1,
  pageSize: 30 | 50 | 100 = 30,
) {
  const search = buildPublicCaseBizWhere(filters);
  const base: Prisma.PublicCaseWhereInput = {
    b2bPublishStatus: "PUBLISHED",
    reviewStatus: "APPROVED",
    NOT: buildPublicCaseCopyKeywordWhere(),
  };
  let where: Prisma.PublicCaseWhereInput = { AND: [base, search] };
  let total = await prisma.publicCase.count({ where });
  if (total === 0 && isLocalDatabaseUrl()) {
    where = { AND: [{ sourceType: "FMP", NOT: buildPublicCaseCopyKeywordWhere() }, search] };
    total = await prisma.publicCase.count({ where });
  }
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const cases = await prisma.publicCase.findMany({
    where,
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ receivedDate: "desc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { cases, total, page, pageSize };
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

export async function getB2CPublicCaseSitemapEntries(): Promise<
  Array<{ id: number; updatedAt: Date }>
> {
  const publicCases = await prisma.publicCase.findMany({
    where: {
      b2cPublishStatus: "PUBLISHED",
      reviewStatus: "APPROVED",
      showPriceB2c: false,
    },
    select: {
      id: true,
      updatedAt: true,
      brandName: true,
      brandNameKana: true,
      brandDisplayName: true,
      modelName: true,
      ref: true,
      caliber: true,
      searchText: true,
      workItems: {
        select: {
          b2cDisplayName: true,
          b2bDisplayName: true,
          normalizedWorkName: true,
        },
      },
      partItems: {
        select: {
          displayName: true,
          normalizedSourceText: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return publicCases
    .filter((publicCase) => !containsCopyKeyword(publicCase))
    .map(({ id, updatedAt }) => ({ id, updatedAt }));
}
