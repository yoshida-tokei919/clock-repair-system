const operationKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function invoiceLineOperationStorageKey(invoiceId: number) {
  return `invoice-line-send:${invoiceId}`;
}

export type InvoiceLineOperation = { operationKey: string; expectedRevision: number };

export function getOrCreateInvoiceLineOperation(storage: Pick<Storage, "getItem" | "setItem">,
  invoiceId: number, expectedRevision: number, createKey: () => string): InvoiceLineOperation {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 2147483647) {
    throw new Error("LINE送信の状態を確認できません。画面を再読み込みしてください。");
  }
  const storageKey = invoiceLineOperationStorageKey(invoiceId);
  const saved = storage.getItem(storageKey);
  if (saved !== null) {
    let operation: InvoiceLineOperation;
    try { operation = JSON.parse(saved); } catch { throw new Error("保存されたLINE送信操作を確認できません。管理者に確認してください。"); }
    if (!operation || typeof operation !== "object" || !operationKeyPattern.test(operation.operationKey)
      || !Number.isInteger(operation.expectedRevision) || operation.expectedRevision < 0
      || operation.expectedRevision > 2147483647) {
      throw new Error("保存されたLINE送信操作を確認できません。管理者に確認してください。");
    }
    return operation;
  }
  const key = createKey();
  if (!operationKeyPattern.test(key)) throw new Error("LINE送信操作キーを作成できませんでした。");
  const operation = { operationKey: key, expectedRevision };
  storage.setItem(storageKey, JSON.stringify(operation));
  return operation;
}

export function shouldClearInvoiceLineOperation(status: number, result: unknown) {
  if (!result || typeof result !== "object") return false;
  const value = result as { ok?: unknown; sentAt?: unknown };
  return status >= 200 && status < 300 && value.ok === true && typeof value.sentAt === "string";
}
