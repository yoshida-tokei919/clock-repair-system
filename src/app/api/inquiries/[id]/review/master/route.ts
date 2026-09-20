import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { InquiryWatchField, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateBrand,
  findOrCreateCaliber,
  findOrCreateModel,
  findOrCreateWatchReference,
} from "@/lib/master-normalize";

const KIND_TO_FIELD = {
  BRAND: "BRAND",
  MODEL: "MODEL",
  REFERENCE: "PRODUCT_REF",
  CASE_REFERENCE: "CASE_REF",
  CALIBER: "CALIBER",
  BASE_CALIBER: "BASE_CALIBER",
} as const satisfies Record<string, InquiryWatchField>;

type RegistrationKind = keyof typeof KIND_TO_FIELD;

class MasterRegistrationInputError extends Error {}

function positiveId(value: unknown, name: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new MasterRegistrationInputError(`${name}が不正です。`);
  return id;
}

function registrationInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new MasterRegistrationInputError("入力が不正です。");
  const input = body as Record<string, unknown>;
  const kind = typeof input.kind === "string" && input.kind in KIND_TO_FIELD ? input.kind as RegistrationKind : null;
  const value = typeof input.value === "string" ? input.value.trim() : "";
  if (!kind || !value || value.length > 500) throw new MasterRegistrationInputError("登録対象または値が不正です。");
  if (input.confirm !== true) throw new MasterRegistrationInputError("登録内容を確認してから実行してください。");
  return { watchId: positiveId(input.watchId, "時計ID"), kind, value, parentId: input.parentId == null ? null : positiveId(input.parentId, "親master") };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const inquiryId = positiveId(params.id, "Inquiry ID");
    const input = registrationInput(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const watch = await tx.inquiryWatch.findFirst({
        where: { id: input.watchId, inquiryId },
        select: {
          id: true, brandId: true, modelId: true, promotedAt: true,
          fieldValues: { select: { id: true, field: true } },
        },
      });
      if (!watch) throw new MasterRegistrationInputError("確認対象の時計が見つかりません。");
      if (watch.promotedAt) throw new MasterRegistrationInputError("昇格済みの時計は編集できません。");

      let master: { id: number; name?: string; nameJp?: string | null };
      let watchUpdate: Prisma.InquiryWatchUpdateInput = {};
      if (input.kind === "BRAND") {
        master = await findOrCreateBrand(tx, input.value);
        watchUpdate = { brand: { connect: { id: master.id } }, model: { disconnect: true }, reference: { disconnect: true }, caseReference: { disconnect: true } };
      } else if (input.kind === "MODEL") {
        if (!input.parentId || watch.brandId !== input.parentId) throw new MasterRegistrationInputError("先にBrandを選択して保存してください。");
        master = await findOrCreateModel(tx, input.parentId, input.value);
        watchUpdate = { model: { connect: { id: master.id } }, reference: { disconnect: true }, caseReference: { disconnect: true } };
      } else if (input.kind === "REFERENCE" || input.kind === "CASE_REFERENCE") {
        if (!input.parentId || watch.modelId !== input.parentId) throw new MasterRegistrationInputError("先にModelを選択して保存してください。");
        master = await findOrCreateWatchReference(tx, input.parentId, input.value);
        watchUpdate = input.kind === "REFERENCE"
          ? { reference: { connect: { id: master.id } } }
          : { caseReference: { connect: { id: master.id } } };
      } else {
        if (!input.parentId) throw new MasterRegistrationInputError("先にメーカーを選択してください。");
        const maker = await tx.brand.findUnique({ where: { id: input.parentId }, select: { id: true } });
        if (!maker) throw new MasterRegistrationInputError("選択されたメーカーが見つかりません。");
        master = await findOrCreateCaliber(tx, input.value, maker.id);
        watchUpdate = input.kind === "CALIBER"
          ? { caliber: { connect: { id: master.id } } }
          : { baseCaliber: { connect: { id: master.id } } };
      }

      await tx.inquiryWatch.update({ where: { id: watch.id }, data: watchUpdate });
      const field = KIND_TO_FIELD[input.kind];
      const existing = watch.fieldValues.find((item) => item.field === field);
      const fieldData = { value: input.value, source: "MANUAL" as const, sourceAiCandidateId: null, confirmationStatus: "CONFIRMED" as const, confirmedAt: new Date() };
      if (existing) await tx.inquiryWatchFieldValue.update({ where: { id: existing.id }, data: fieldData });
      else await tx.inquiryWatchFieldValue.create({ data: { inquiryWatchId: watch.id, field, ...fieldData } });
      return { id: master.id, value: input.value, field };
    });
    return NextResponse.json({ ok: true, master: result });
  } catch (error) {
    if (error instanceof MasterRegistrationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Inquiry master registration error", error);
    return NextResponse.json({ error: "masterを登録できませんでした。" }, { status: 500 });
  }
}
