import assert from "node:assert/strict";
import test from "node:test";
import { findOrCreateModel, findOrCreateWatchReference } from "./master-normalize";

function fakeDb() {
  const models: any[] = [{ id: 1, brandId: 10, name: "Speedmaster", nameEn: null, nameJp: "スピードマスター" }];
  const references: any[] = [{ id: 2, modelId: 1, name: " 145.022 " }];
  return {
    models,
    references,
    db: {
      model: {
        findMany: async ({ where }: any) => models.filter((model) => model.brandId === where.brandId),
        create: async ({ data }: any) => { const model = { id: models.length + 1, ...data }; models.push(model); return model; },
      },
      watchReference: {
        findMany: async ({ where }: any) => references.filter((reference) => reference.modelId === where.modelId),
        create: async ({ data }: any) => { const reference = { id: references.length + 2, ...data }; references.push(reference); return reference; },
      },
    } as any,
  };
}

test("model registration is normalized within its selected Brand", async () => {
  const fake = fakeDb();
  const existing = await findOrCreateModel(fake.db, 10, "  speedmaster ");
  assert.equal(existing.id, 1);
  assert.equal(fake.models.length, 1);

  const created = await findOrCreateModel(fake.db, 10, "Seamaster");
  assert.equal(created.brandId, 10);
  assert.equal(fake.models.length, 2);
});

test("reference registration is normalized within its selected Model", async () => {
  const fake = fakeDb();
  const existing = await findOrCreateWatchReference(fake.db, 1, "145.022");
  assert.equal(existing.id, 2);
  assert.equal(fake.references.length, 1);

  const created = await findOrCreateWatchReference(fake.db, 1, " 3570.50 ");
  assert.equal(created.modelId, 1);
  assert.equal(created.name, "3570.50");
  assert.equal(fake.references.length, 2);
});
