type SnapshotInput = {
    category?: string | null;
    sourceAreaSnapshot?: string | null;
    categoryNameSnapshot?: string | null;
    targetPartNameSnapshot?: string | null;
    actionNameSnapshot?: string | null;
    detailLabelSnapshot?: string | null;
    b2cDisplayNameSnapshot?: string | null;
    gradeNameSnapshot?: string | null;
    grade?: string | null;
};

// Keep Task125's master-independent snapshots alongside the structured dual write.
export function estimateItemSnapshots(item: SnapshotInput) {
    const category = item.category;
    const sourceAreaSnapshot = category === 'internal' || category === 'part_internal'
        ? 'internal'
        : category === 'external' || category === 'external_labor' || category === 'part_external'
            ? 'external'
            : item.sourceAreaSnapshot ?? null;
    return {
        sourceAreaSnapshot,
        categoryNameSnapshot: item.categoryNameSnapshot ?? null,
        targetPartNameSnapshot: item.targetPartNameSnapshot ?? null,
        actionNameSnapshot: item.actionNameSnapshot ?? null,
        detailLabelSnapshot: item.detailLabelSnapshot ?? null,
        b2cDisplayNameSnapshot: item.b2cDisplayNameSnapshot ?? null,
        gradeNameSnapshot: item.gradeNameSnapshot ?? item.grade ?? null,
    };
}
