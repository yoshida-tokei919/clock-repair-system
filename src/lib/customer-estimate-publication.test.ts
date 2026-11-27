import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasCurrentPublishedEstimate, hasIssuedPdf, publishedApprovedEstimate } from "./customer-estimate-publication";
import { issuedOptionSourceHash } from "./estimate-options";

function repairWithPdf(options = false) {
  const repair: any = {
    id: 1003, customerId: 2, inquiryNumber: "C-1003", customerNote: "発行時の説明", customer: { type: "individual" },
    watch: { timepieceType: "WATCH", timepieceTypeLabel: null, serialNumber: "123", brand: { name: "Brand" }, model: null, reference: null, caseReference: null },
    estimate: { pricingTaxMode: "EXCLUSIVE", totalAmount: 1000, taxAmount: 100, discountAmount: 0, shipping: 0,
      items: [{ id: 1, itemName: "修理", type: "labor", unitPrice: 1000, quantity: 1, partsMasterId: null }] },
    estimateOptionSet: options ? { id: 5, title: "プラン", notes: null, isActive: true, choices: [] } : null,
    estimateDocument: { id: 9, customerId: 2, pricingTaxMode: "EXCLUSIVE", totalAmount: 1000, taxAmount: 100,
      estimateNumber: "E-9", issuedDate: new Date("2026-11-27T00:00:00Z"), customer: { type: "individual", name: "顧客", companyName: null, address: null }, currentPdfFile: null },
  };
  const document = repair.estimateDocument;
  document.currentPdfFile = { id: 10, estimateDocumentId: 9, status: "current", storageKey: "stored.pdf", hash: "sha256", fileSize: 100,
    optionSourceHashes: { [repair.id]: issuedOptionSourceHash(document, repair) } };
  return repair;
}

test("unissued C-1003 stays hidden; current standard and option PDFs publish matching HTML", () => {
  for (const options of [false, true]) {
    const repair = repairWithPdf(options);
    assert.equal(hasCurrentPublishedEstimate(repair), true);
    repair.estimateDocument.currentPdfFile = null;
    assert.equal(hasIssuedPdf(repair), false);
    assert.equal(hasCurrentPublishedEstimate(repair), false);
  }
});

test("operator edits and old PDFs keep only the stored PDF accessible", () => {
  const repair = repairWithPdf();
  repair.customerNote = "未発行の編集";
  assert.equal(hasIssuedPdf(repair), true);
  assert.equal(hasCurrentPublishedEstimate(repair), false);
  repair.estimateDocument.currentPdfFile.optionSourceHashes = {};
  assert.equal(hasIssuedPdf(repair), true);
  assert.equal(hasCurrentPublishedEstimate(repair), false);
});

test("approved plan shows immutable confirmed lines and gross, not later draft edits", () => {
  const repair = repairWithPdf(true);
  const commonLines = repair.estimate.items.map((line: any) => ({ ...line }));
  const selectedLines = [{ id: 2, itemNameSnapshot: "選択した作業", lineType: "LABOR", unitPrice: 3000, quantity: 1 }];
  const sourceHash = repair.estimateDocument.currentPdfFile.optionSourceHashes[String(repair.id)];
  repair.estimateOptionApproval = {
    repairId: repair.id, estimateDocumentId: 9, pdfFileId: 10, optionSourceHash: sourceHash,
    grossAmount: 4400, taxAmount: 400, lineSnapshot: { commonLines, selectedLines },
  };
  repair.approvalStatus = "approved";
  repair.estimate.items.push({ id: 2, itemName: "選択した作業", type: "labor", unitPrice: 3000, quantity: 1, partsMasterId: null });
  assert.equal(hasIssuedPdf(repair), true);
  assert.equal(hasCurrentPublishedEstimate(repair), false);
  assert.deepEqual(publishedApprovedEstimate(repair)?.lines.map(line => line.name), ["修理", "選択した作業"]);
  assert.equal(publishedApprovedEstimate(repair)?.grossAmount, 4400);
  repair.estimate.items.push({ id: 3, itemName: "未発行の編集", type: "labor", unitPrice: 9999, quantity: 1 });
  assert.equal(publishedApprovedEstimate(repair)?.grossAmount, 4400);
  repair.estimateOptionApproval.optionSourceHash = "forged";
  assert.equal(publishedApprovedEstimate(repair), null);
  repair.estimateOptionApproval.optionSourceHash = sourceHash;
  repair.estimateOptionApproval.pdfFileId = 999;
  assert.equal(publishedApprovedEstimate(repair), null);
});

test("all public share branches gate amounts, options, explanations, export and approval", () => {
  const page = readFileSync("src/app/(private)/customer/repairs/[token]/page.tsx", "utf8");
  const issue = readFileSync("src/app/api/documents/estimate/[id]/pdf/generate/route.ts", "utf8");
  const approval = readFileSync("src/app/api/customer/repairs/[id]/approve/route.ts", "utf8");
  assert.match(issue, /estimateDocument\.repairs\s*\.map\(repair => \[String\(repair\.id\), issuedOptionSourceHash/);
  assert.equal((page.match(/publishedEstimate && activeOptions && repair\.approvalStatus === "pending" &&(?: repairToken &&)? <CustomerEstimateOptions/g) ?? []).length, 2);
  assert.equal((page.match(/showApproval=\{publishedEstimate && !activeOptions/g) ?? []).length, 2);
  assert.match(page, /repairs\.every\(hasCurrentPublishedEstimate\) && <CustomerExportTools/);
  assert.match(page, /publishedEstimate && <CustomerGuideAmountInput/);
  assert.equal((page.match(/approvedSnapshot && <ApprovedEstimateSection/g) ?? []).length, 2);
  assert.match(page, /publishedApprovedEstimate\(repair\)/);
  assert.match(approval, /isIssuedOptionPdfCurrent\(pdf, document\.id, repair\.id/);
  assert.doesNotMatch(page, /pageTotal|href=\{`\/documents\/estimate\//);
});
