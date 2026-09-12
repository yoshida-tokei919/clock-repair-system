import { matchesBrandSearch, normalizeBrandName } from "@/lib/master-normalize";

export type IntakeBrandSource = {
  id: number;
  name: string;
  nameEn: string | null;
  nameJp: string | null;
  brandKind: "NORMAL" | "TYPE" | "UNKNOWN";
  isWatchBrand: boolean;
  aliases?: Array<{ alias: string }>;
};

export type IntakeBrandOption = {
  id: number;
  name: string;
  label: string;
  brandKind: "NORMAL" | "UNKNOWN";
  searchValues: string[];
  sortName: string;
};

export function getIntakeBrandOptions(brands: IntakeBrandSource[]): IntakeBrandOption[] {
  return brands
    .filter((brand): brand is IntakeBrandSource & { brandKind: "NORMAL" | "UNKNOWN" } =>
      brand.isWatchBrand && (brand.brandKind === "NORMAL" || brand.brandKind === "UNKNOWN"),
    )
    .map((brand) => ({
      id: brand.id,
      name: brand.name,
      label: brand.nameEn || brand.name,
      brandKind: brand.brandKind,
      searchValues: [brand.name, brand.nameEn, brand.nameJp, ...(brand.aliases ?? []).map((alias) => alias.alias)].filter(
        (value): value is string => Boolean(value),
      ),
      sortName: brand.nameEn || brand.name,
    }))
    .sort((left, right) => {
      if (left.brandKind === "UNKNOWN") return right.brandKind === "UNKNOWN" ? 0 : 1;
      if (right.brandKind === "UNKNOWN") return -1;
      return normalizeBrandName(left.sortName).localeCompare(normalizeBrandName(right.sortName), "en");
    });
}

export function searchIntakeBrandOptions(options: IntakeBrandOption[], query: string) {
  return query.trim() ? options.filter((option) => matchesBrandSearch(query, option.searchValues)) : options;
}
