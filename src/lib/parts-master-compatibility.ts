import { normalizeMasterName } from "@/lib/master-normalize";

export function resolvePatchProductRef(
    watch: { ref?: string | null } | null | undefined,
    savedRef?: string | null
): { name: string | null; supplied: boolean } {
    const supplied = watch != null && Object.prototype.hasOwnProperty.call(watch, "ref");
    return {
        name: supplied ? (watch.ref?.trim() ? watch.ref : null) : savedRef ?? null,
        supplied,
    };
}

export function splitWatchRefs(value?: string | null): string[] {
    return (value ?? "").split(/[\n,、，]+/).map((ref) => ref.trim()).filter(Boolean);
}

function normalizeWatchRef(value: string): string {
    return normalizeMasterName(value.normalize("NFKC"));
}

export function mergeWatchRefs(existing?: string | null, incoming?: string | null): string | null {
    const refs = new Map<string, string>();
    for (const ref of [...splitWatchRefs(existing), ...splitWatchRefs(incoming)]) {
        const key = normalizeWatchRef(ref);
        if (key && !refs.has(key)) refs.set(key, ref);
    }
    return refs.size ? Array.from(refs.values()).join(", ") : null;
}

export function hasWatchRefOverlap(currentRefs?: string | null, candidateRefs?: string | null): boolean {
    const current = new Set(splitWatchRefs(currentRefs).map(normalizeWatchRef));
    return current.size > 0 && splitWatchRefs(candidateRefs).some((ref) => current.has(normalizeWatchRef(ref)));
}

export function hasPartRefOverlap(incoming?: string | null, candidate?: string | null): boolean {
    const incomingTokens = new Set(splitWatchRefs(incoming).map(normalizeWatchRef));
    return incomingTokens.size > 0 && splitWatchRefs(candidate).some((ref) => incomingTokens.has(normalizeWatchRef(ref)));
}

export function watchRefsAllowIdentity(incoming?: string | null, candidate?: string | null): boolean {
    return splitWatchRefs(incoming).length === 0 || splitWatchRefs(candidate).length === 0
        || hasWatchRefOverlap(incoming, candidate);
}

export function preserveStandardPartNameId(existing?: string | null, incoming?: string | null): string | null {
    return incoming?.trim() || existing?.trim() || null;
}

export function matchesStandardPartName(
    candidate: { standardPartNameId: string | null; nameJp: string },
    selectedId?: string | null,
    selectedName?: string | null,
    selectedDisplayName?: string | null
): boolean {
    if (!selectedId) return true;
    if (candidate.standardPartNameId) return candidate.standardPartNameId === selectedId;
    const candidateName = normalizeMasterName(candidate.nameJp.normalize("NFKC"));
    return [selectedName, selectedDisplayName].some((name) =>
        Boolean(name) && candidateName === normalizeMasterName(name?.normalize("NFKC"))
    );
}

export function matchesStandardPartNameIdentity(
    candidate: { standardPartNameId: string | null; nameJp: string },
    incoming: { standardPartNameId: string | null; nameJp: string },
    allowedLegacyNames?: Array<string | null>
): boolean {
    if (!incoming.standardPartNameId) return true;
    if (candidate.standardPartNameId) return candidate.standardPartNameId === incoming.standardPartNameId;
    const candidateName = normalizeMasterName(candidate.nameJp.normalize("NFKC"));
    return (allowedLegacyNames ?? []).some((name) =>
        Boolean(name) && candidateName === normalizeMasterName(name?.normalize("NFKC"))
    );
}

export function matchesExteriorPartCandidate(
    candidate: { brandId: number | null; modelId: number | null; watchRefs: string | null; standardPartNameId: string | null; nameJp: string; partType?: string | null; category?: string | null },
    selected: { brandId?: number | null; modelId?: number | null; currentRefs?: string | null; standardPartNameId?: string | null; standardPartName?: string | null; standardDisplayName?: string | null }
): boolean {
    if (candidate.partType === "interior" || candidate.category === "internal") return false;
    if (!selected.brandId || candidate.brandId !== selected.brandId) return false;
    if (!matchesStandardPartName(candidate, selected.standardPartNameId, selected.standardPartName, selected.standardDisplayName)) return false;
    if (splitWatchRefs(selected.currentRefs).length > 0) {
        return hasWatchRefOverlap(selected.currentRefs, candidate.watchRefs);
    }
    return !selected.modelId || candidate.modelId === selected.modelId || candidate.modelId === null;
}

export type InternalPartContext = {
    movementMakerId?: number | null;
    movementCaliberId?: number | null;
    baseMovementMakerId?: number | null;
    baseMovementCaliberId?: number | null;
};

export function hasCompleteInternalPartContext(context: InternalPartContext): boolean {
    return Boolean((context.movementMakerId && context.movementCaliberId)
        || (context.baseMovementMakerId && context.baseMovementCaliberId));
}

export function matchesInternalPartCandidate(
    candidate: { partType?: string | null; category?: string | null; movementMakerId: number | null; caliberId: number | null; baseMakerId: number | null; baseCaliberId: number | null; standardPartNameId: string | null; nameJp: string },
    context: InternalPartContext & { standardPartNameId?: string | null; standardPartName?: string | null; standardDisplayName?: string | null }
): boolean {
    if (candidate.partType === "exterior" || candidate.category === "external") return false;
    if (!matchesStandardPartName(candidate, context.standardPartNameId, context.standardPartName, context.standardDisplayName)) return false;
    return Boolean((context.movementMakerId && context.movementCaliberId
        && candidate.movementMakerId === context.movementMakerId && candidate.caliberId === context.movementCaliberId)
        || (context.baseMovementMakerId && context.baseMovementCaliberId
            && candidate.baseMakerId === context.baseMovementMakerId && candidate.baseCaliberId === context.baseMovementCaliberId));
}
