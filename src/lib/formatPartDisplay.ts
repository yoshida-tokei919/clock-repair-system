type PartDisplayInput = {
  name?: string | null;
  grade?: string | null;
  note2?: string | null;
};

export function formatPartDisplay({ name, grade, note2 }: PartDisplayInput): string {
  const baseName = (name ?? "").trim();
  if (!baseName) return "";

  const extras = [grade, note2]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return extras.length > 0 ? `${baseName}（${extras.join("・")}）` : baseName;
}
