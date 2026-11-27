export function customerOptionLineLabel(name: string, lineType?: string | null): string {
  if (lineType !== "LABOR" && lineType !== "PART") return name;
  const label = (lineType === "LABOR"
    ? name.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}）])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1")
    : name).trim();
  const qualifier = lineType === "LABOR" ? "技術料" : "部品代";
  if (new RegExp(`(?:\\s*[（(]${qualifier}[）)]|\\s+${qualifier})$`).test(label)) return label;
  const withDetail = label.replace(/（([^（）]+)）$/, (_, detail: string) => `（${detail}・${qualifier}）`);
  return withDetail !== label ? withDetail : `${label}（${qualifier}）`;
}

export function customerOptionLineQuantity(quantity: number, unit?: string | null): string {
  return quantity > 1 ? ` × ${quantity}${unit ?? ""}` : "";
}
