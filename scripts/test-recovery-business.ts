import assert from 'node:assert/strict';

// No database connection: API routes receive this transaction mock before import.
async function main() {
    const customer = { id: 1, type: 'individual', currentSeq: 0, prefix: 'C' };
    const brand = { id: 1, name: 'TestBrand', nameJp: 'テスト', kana: null };
    let estimateRows: any[] = [];
    let structuredRows: any[] = [];
    let rules: any[] = [];
    let publicCaseData: any = null;
    let existingCase: { id: number } | null = null;
    let repair: any = {
        id: 77, customerId: 1, watchId: 1, status: '修理中',
        createdAt: new Date(), receptionDate: new Date(), inquiryNumber: 'C-077',
        movementCaliber: { name: 'Movement' }, baseMovementCaliber: { name: 'Base' },
        watch: { brandId: 1, modelId: 1, caliberId: 1, referenceId: null,
            brand, model: { id: 1, name: 'Model', nameJp: null },
            caliber: { id: 1, name: 'WatchCal' }, reference: null },
    };
    const tx: any = {
        customer: { findUnique: async () => customer, update: async () => customer },
        brand: { findMany: async () => [brand] },
        model: { findFirst: async () => ({ id: 1 }) },
        watch: { create: async () => ({ id: 1 }) },
        repair: {
            findMany: async () => [],
            create: async ({ data }: any) => (repair = { ...repair, ...data }),
            findUnique: async () => ({ ...repair,
                estimate: { items: estimateRows }, repairLineItems: structuredRows }),
            update: async ({ data }: any) => (repair = { ...repair, ...data }),
        },
        estimate: {
            create: async ({ data }: any) => {
                estimateRows = data.items.create.map((item: any, i: number) => ({ ...item, id: 100 + i, partsMaster: null }));
                return { id: 1 };
            },
            upsert: async () => ({ id: 1 }),
        },
        estimateItem: {
            deleteMany: async () => { estimateRows = []; },
            createMany: async ({ data }: any) => {
                estimateRows = data.map((item: any, i: number) => ({ ...item, id: 100 + i, partsMaster: null }));
            },
        },
        repairLineItem: {
            deleteMany: async () => { structuredRows = []; },
            createMany: async ({ data }: any) => {
                structuredRows = data.map((item: any, i: number) => ({ ...item, id: 200 + i,
                    repairWorkCategory: item.repairWorkCategoryId === 10 ? { repairType: 'INTERNAL' } : null,
                    partsMaster: null,
                }));
                return { count: data.length };
            },
        },
        repairWorkCategory: { findMany: async () => [] },
        pricingRule: { findFirst: async () => null, create: async ({ data }: any) => { rules.push(data); return { id: rules.length }; } },
        repairStatusLog: { findFirst: async () => ({ id: 1 }), create: async () => ({ id: 1 }) },
        orderRequest: { findMany: async () => [] },
        publicCase: {
            findUnique: async () => existingCase,
            create: async ({ data }: any) => { publicCaseData = data; return { id: 500 }; },
        },
    };
    (globalThis as any).prisma = { ...tx, $transaction: async (fn: any) => fn(tx) };
    const { POST: createRepair } = await import('../src/app/api/repairs/route');
    const { PATCH: updateRepair } = await import('../src/app/api/repairs/[id]/route');
    const { POST: createDraft } = await import('../src/app/api/repairs/[id]/public-case/route');
    const { estimateItemSnapshots } = await import('../src/lib/estimate-item-snapshots');
    const { __partsMasterInternals } = await import('../src/lib/parts-master');
    const { __partsMasterGrowthPreviewInternals: growth } = await import('../src/lib/parts-master-growth-preview');
    const { buildProfiledPartSearchQuery } = await import('../src/lib/part-search');
    const input = [
        { type: 'labor', category: 'internal', name: '内装修理', price: 5000, quantity: 1,
          repairWorkCategoryId: 10, repairWorkActionId: 20, targetPartNameId: 'part-name-01',
          categoryNameSnapshot: '内装', targetPartNameSnapshot: '歯車', actionNameSnapshot: '修理',
          detailLabelSnapshot: '保存詳細', b2cDisplayNameSnapshot: '公開用名称', grade: '純正' },
        { type: 'labor', category: 'external_labor', name: '外装修理', price: 3000, quantity: 1,
          repairWorkActionId: 21, targetPartNameId: 'part-name-02',
          categoryNameSnapshot: '外装', targetPartNameSnapshot: 'ケース', actionNameSnapshot: '修理',
          detailLabelSnapshot: '外装詳細', b2cDisplayNameSnapshot: '外装公開名', grade: 'FIT' },
    ];
    const request = (body: unknown) => new Request('http://localhost/api/repairs', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    // Keep route debug logs quiet: all data here are synthetic.
    const originalLog = console.log;
    console.log = () => {};
    try {
        const created = await createRepair(request({ customer: { id: '1' }, watch: { brand: 'TestBrand', model: 'Model' },
            request: {}, status: '修理中', estimate: { items: input } }));
        assert.equal(created.status, 200, JSON.stringify(await created.json()));
        assert.equal(structuredRows.length, 2);
        assert.equal(structuredRows[0].targetPartNameId, 'part-name-01');
        assert.equal(structuredRows[0].partsMasterId, null);
        assert.equal(estimateRows[1].sourceAreaSnapshot, 'external');
        assert.equal(rules[1].caliberId, null);
        assert.equal(rules[1].customerType, 'individual');
        const snapshotsBefore = estimateRows.map(estimateItemSnapshots);
        // Rebuild the client save payload from persisted rows, preserving structured IDs.
        const reloaded = estimateRows.map((row, i) => ({ ...input[i],
            name: row.itemName, price: row.unitPrice, quantity: row.quantity,
            ...estimateItemSnapshots(row), grade: row.gradeNameSnapshot,
            targetPartNameId: structuredRows[i].targetPartNameId,
        }));
        for (let pass = 0; pass < 2; pass++) {
            const updated = await updateRepair(request({ status: '修理中', estimate: { items: reloaded } }), { params: { id: '77' } });
            assert.equal(updated.status, 200, JSON.stringify(await updated.json()));
            assert.deepEqual(estimateRows.map(estimateItemSnapshots), snapshotsBefore);
            assert.equal(structuredRows[0].repairWorkCategoryId, 10);
            assert.equal(structuredRows[1].targetPartNameId, 'part-name-02');
        }
        // Structured snapshots win, even when EstimateItem text differs.
        structuredRows[0].itemNameSnapshot = '構造化明細が正本';
        let draft = await createDraft(request({}), { params: { id: '77' } });
        assert.equal(draft.status, 200);
        assert.equal(publicCaseData.workItems.create.length, 2);
        assert.equal(publicCaseData.workItems.create[0].sourceText, '構造化明細が正本');
        assert.equal(publicCaseData.workItems.create[1].sourceArea, 'external');
        assert.equal(publicCaseData.workItems.create[0].b2cDisplayName, '公開用名称');
        assert.equal(publicCaseData.caliber, 'Movement');
        assert.equal(publicCaseData.showPriceB2c, false);
        assert.equal(publicCaseData.b2cPublishStatus, 'HIDDEN');
        existingCase = { id: 500 };
        draft = await createDraft(request({}), { params: { id: '77' } });
        assert.equal((await draft.json()).created, false);
        existingCase = null;
        structuredRows = [];
        estimateRows.push({ id: 102, type: 'part', itemName: '未登録部品', sourceAreaSnapshot: 'internal',
            partsMasterId: null, partsMaster: null, gradeNameSnapshot: '中古' });
        for (const [movement, base, watch, expected] of [
            [null, { name: 'Base' }, { name: 'WatchCal' }, 'Base'],
            [null, null, { name: 'WatchCal' }, 'WatchCal'],
            [null, null, null, null],
        ] as const) {
            repair.movementCaliber = movement; repair.baseMovementCaliber = base; repair.watch.caliber = watch;
            draft = await createDraft(request({}), { params: { id: '77' } });
            assert.equal(draft.status, 200);
            assert.equal(publicCaseData.caliber, expected);
            assert.equal(publicCaseData.workItems.create[0].attributes.estimateItemId, 100);
            assert.equal(publicCaseData.partItems.create[0].displayName, '未登録部品');
            assert.equal(publicCaseData.partItems.create[0].metadata.gradeNameSnapshot, '中古');
        }
        assert.equal((await createDraft(request({}), { params: { id: 'bad' } })).status, 400);
        for (const ref of [' AB-12 ', 'AB.12', 'AB/12', 'ab12']) {
            assert.equal(__partsMasterInternals.normalizeRefToken(ref), ref.trim());
            assert.equal(growth.normalizePartRefForCompare(ref), ref.trim());
        }
        for (const grade of ['純正', 'FIT', '合わせ', '中古']) {
            assert.equal(growth.gradeMatches({ grade }, { grade }), true);
            for (const other of ['純正', 'FIT', '合わせ', '中古'].filter(value => value !== grade)) {
                assert.equal(growth.gradeMatches({ grade }, { grade: other }), false);
            }
        }
        const context = { watchBrand: 'WatchBrand', movementMaker: 'MovementMaker',
            movementCaliber: 'Cal. 1234', partRef: 'AB-12', partNameEn: 'gear' };
        const internalQuery = buildProfiledPartSearchQuery({ context: { ...context, partType: 'interior' },
            lang: 'en', profile: { tokens: ['movementMaker', 'movementCaliber'], partIdentifierMode: 'partRef' } });
        const externalQuery = buildProfiledPartSearchQuery({ context: { ...context, partType: 'external' },
            lang: 'en', profile: { tokens: ['watchBrand'], partIdentifierMode: 'partName' } });
        assert.match(internalQuery, /MovementMaker/);
        assert.doesNotMatch(internalQuery, /WatchBrand/);
        assert.match(externalQuery, /WatchBrand/);
        assert.doesNotMatch(externalQuery, /MovementMaker/);
    } finally { console.log = originalLog; }
    console.log('PASS: Repair create + two resaves, structured IDs, seven snapshots, external pricing, structured-first / legacy PublicCase, duplicate guard, Cal fallback, unregistered parts. No DB connection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
