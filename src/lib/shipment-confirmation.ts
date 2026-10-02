function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function serverError(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "string") return null;
  const message = error.trim();
  return message.length > 0 && message.length <= 200 ? message : null;
}

export class ShipmentResultUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShipmentResultUncertainError";
  }
}

export async function createSelectedShipment(repairIds: number[], fetcher: typeof fetch = fetch): Promise<number> {
  let response: Response;
  try {
    response = await fetcher("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ repairIds, confirmed: true }),
  });
  } catch {
    throw new ShipmentResultUncertainError("通信が途切れ、発送の作成結果を確認できませんでした。再送せず管理者に確認してください。");
  }
  if (!response.ok) {
    const fallback: Record<number, string> = {
      401: "認証が必要です。再ログインしてください。",
      400: "発送対象の指定が不正です。選択を確認してください。",
      404: "修理案件が見つかりません。選択を確認してください。",
      409: "顧客または返送先を確認できません。案件の返送先を確認してください。",
    };
    const body: unknown = await response.json().catch(() => null);
    throw new Error(serverError(body) ?? fallback[response.status] ?? "発送を作成できませんでした。もう一度お試しください。");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !isPositiveId((body as Record<string, unknown>).id)) {
    throw new ShipmentResultUncertainError("発送の作成結果を確認できませんでした。再送せず管理者に確認してください。");
  }
  return (body as { id: number }).id;
}
