type RepairListPhoto = {
    id: number;
    stage: "RECEPTION" | "WORK" | "COMPLETION" | null;
    storageKey: string;
};

export function selectRepairListPhoto(latest: Pick<RepairListPhoto, "id" | "storageKey"> | undefined, fronts: RepairListPhoto[]): Pick<RepairListPhoto, "id" | "storageKey"> | undefined {
    let selected: RepairListPhoto | undefined;
    for (const photo of fronts) {
        if (!selected ||
            (photo.stage === "RECEPTION" && selected.stage !== "RECEPTION") ||
            ((photo.stage === "RECEPTION") === (selected.stage === "RECEPTION") && photo.id > selected.id)) {
            selected = photo;
        }
    }
    return selected ?? latest;
}
