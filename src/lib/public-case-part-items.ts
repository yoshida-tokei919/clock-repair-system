export type PartItemInput = { id?: number; displayName: string };

export function partItemInputs(value: unknown): PartItemInput[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;

  const inputs: PartItemInput[] = [];
  const existingIds = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = (item as { id?: unknown }).id;
    if (id !== undefined) {
      if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || existingIds.has(id)) return null;
      existingIds.add(id);
    }
    const rawName = (item as { displayName?: unknown }).displayName;
    if (typeof rawName !== "string") return null;
    const displayName = rawName.trim();
    if (!displayName) {
      if (id !== undefined) return null;
      continue;
    }
    inputs.push({ ...(typeof id === "number" ? { id } : {}), displayName });
  }
  return inputs;
}
