import { Prisma } from "@prisma/client";

export const REPAIR_LIST_PAGE_SIZE = 50;
export const REPAIR_STATUSES = ["送付待ち", "受付", "見積中", "承認待ち", "部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み", "作業待ち", "作業中", "作業完了", "納品済み", "キャンセル", "修理不可返却", "キャンセル返却", "保留"] as const;
export const FILTER_KEYS = ["q", "type", "customer", "brand", "status", "delivery", "partEntries", "orderRequest", "receptionFrom", "receptionTo", "approvalFrom", "approvalTo", "pendingFrom", "pendingTo", "deliveredFrom", "deliveredTo", "amountMin", "amountMax"] as const;
export type FilterKey = typeof FILTER_KEYS[number];
export type RawParams = Record<string, string | string[] | undefined>;
export type RepairListFilters = Record<FilterKey, string> & { page: number };

const dateKeys = ["reception", "approval", "pending", "delivered"] as const;
const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value.slice(0, 160).trim() : "";
const ids = (value: string) => [...new Set(value.split(",").slice(0, 20).filter(v => /^[1-9]\d{0,8}$/.test(v)))].join(",");
const statuses = (value: string) => [...new Set(value.split(",").slice(0, 20).filter(v => (REPAIR_STATUSES as readonly string[]).includes(v)))].join(",");
const validDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const date = new Date(`${value}T00:00:00+09:00`);
    return !Number.isNaN(date.getTime()) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) === value ? value : "";
};
const amount = (value: string) => /^\d{1,9}$/.test(value) ? String(Number(value)) : "";

export function normalizeRepairListParams(raw: RawParams): RepairListFilters {
    const result = Object.fromEntries(FILTER_KEYS.map(key => [key, scalar(raw[key])])) as Record<FilterKey, string>;
    result.q = result.q.slice(0, 100);
    result.customer = ids(result.customer);
    result.brand = ids(result.brand);
    result.status = statuses(result.status === "all" ? "" : result.status);
    result.type = ["business", "individual"].includes(result.type) ? result.type : "";
    result.delivery = ["delivered", "undelivered"].includes(result.delivery) ? result.delivery : "";
    result.partEntries = ["with", "without"].includes(result.partEntries) ? result.partEntries : "";
    result.orderRequest = ["pending", "ordered", "received", "partial", "noRequest"].includes(result.orderRequest) ? result.orderRequest : "";
    for (const prefix of dateKeys) {
        const from = `${prefix}From` as FilterKey;
        const to = `${prefix}To` as FilterKey;
        result[from] = validDay(result[from]);
        result[to] = validDay(result[to]);
        if (result[from] && result[to] && result[from] > result[to]) { result[from] = ""; result[to] = ""; }
    }
    result.amountMin = amount(result.amountMin);
    result.amountMax = amount(result.amountMax);
    if (result.amountMin && result.amountMax && Number(result.amountMin) > Number(result.amountMax)) {
        result.amountMin = ""; result.amountMax = "";
    }
    const pageText = scalar(raw.page);
    const page = /^[1-9]\d{0,5}$/.test(pageText) ? Number(pageText) : 1;
    return { ...result, page };
}

export function tokyoDayRange(from: string, to: string): { gte?: Date; lt?: Date } | undefined {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lt?: Date } = {};
    if (from) range.gte = new Date(`${from}T00:00:00+09:00`);
    if (to) range.lt = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000);
    return range;
}

export function buildRepairListWhere(filters: RepairListFilters): Prisma.RepairWhereInput {
    const and: Prisma.RepairWhereInput[] = [];
    if (filters.q) {
        const contains = { contains: filters.q, mode: "insensitive" as const };
        and.push({ OR: [
            { inquiryNumber: contains }, { partnerRef: contains }, { endUserName: contains },
            { customer: { name: contains } }, { customer: { companyName: contains } },
            { watch: { modelNameInput: contains } }, { watch: { serialNumber: contains } },
            { watch: { brand: { name: contains } } }, { watch: { brand: { nameJp: contains } } },
            { watch: { model: { name: contains } } }, { watch: { reference: { name: contains } } },
            { watch: { caseReference: { name: contains } } }, { watch: { caliber: { name: contains } } },
        ] });
    }
    if (filters.type) and.push({ customer: { type: filters.type } });
    if (filters.customer) and.push({ customerId: { in: filters.customer.split(",").map(Number) } });
    if (filters.brand) and.push({ watch: { brandId: { in: filters.brand.split(",").map(Number) } } });
    if (filters.status) and.push({ status: { in: filters.status.split(",") } });
    if (filters.delivery) and.push({ status: filters.delivery === "delivered" ? "納品済み" : { not: "納品済み" } });
    if (filters.partEntries === "with") and.push({ OR: [
        { repairLineItems: { some: { lineType: "PART" } } },
        { estimate: { items: { some: { type: "part" } } } },
    ] });
    if (filters.partEntries === "without") and.push({
        repairLineItems: { none: { lineType: "PART" } },
        NOT: { estimate: { items: { some: { type: "part" } } } },
    });
    if (filters.orderRequest === "pending" || filters.orderRequest === "ordered" || filters.orderRequest === "received") {
        and.push({ orderRequests: { some: { status: filters.orderRequest } } });
    }
    if (filters.orderRequest === "partial") and.push({ AND: [
        { orderRequests: { some: { status: "pending" } } },
        { orderRequests: { some: { status: { in: ["ordered", "received"] } } } },
    ] });
    if (filters.orderRequest === "noRequest") and.push({ orderRequests: { none: {} } });
    const reception = tokyoDayRange(filters.receptionFrom, filters.receptionTo);
    const approval = tokyoDayRange(filters.approvalFrom, filters.approvalTo);
    const pending = tokyoDayRange(filters.pendingFrom, filters.pendingTo);
    const delivered = tokyoDayRange(filters.deliveredFrom, filters.deliveredTo);
    if (reception) and.push({ receptionDate: reception });
    if (approval) and.push({ approvalDate: approval });
    if (pending) and.push({ logs: { some: { status: "承認待ち", changedAt: pending } } });
    if (delivered) and.push({ deliveryDateActual: delivered });
    if (filters.amountMin || filters.amountMax) and.push({ estimate: { totalAmount: {
        ...(filters.amountMin ? { gte: Number(filters.amountMin) } : {}),
        ...(filters.amountMax ? { lte: Number(filters.amountMax) } : {}),
    } } });
    return and.length ? { AND: and } : {};
}

export function repairListPage(page: number, count: number) {
    const totalPages = Math.max(1, Math.ceil(count / REPAIR_LIST_PAGE_SIZE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    return { currentPage, totalPages, skip: (currentPage - 1) * REPAIR_LIST_PAGE_SIZE };
}

export function repairListUrl(filters: RepairListFilters, page = 1) {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
    if (page > 1) params.set("page", String(page));
    return `/repairs${params.size ? `?${params}` : ""}`;
}
