# Task196E — DK-2205 PhysicalTag label

## Scope

- Brother QL-800 with DK-2205 continuous 62 mm tape; PDF page is 62 × 75 mm.
- Browser PDF preview and printing remain the output path. No Brother SDK or direct printer command.
- QR payload remains exactly `PhysicalTag.qrToken`. Printed Repair and customer fields are not encoded in the QR.
- PhysicalTag assignment, release, replacement, schema, migrations, RLS, and GRANT are unchanged.

## Printed fields

- `Repair.inquiryNumber` is the primary visible identifier. The database `Repair.id` is never printed.
- B2C: `Customer.name`. B2B: `Customer.companyName` (fallback `Customer.name`), then optional `Repair.endUserName` and `Repair.partnerRef` as separate lines.
- Brand, model, Ref., `Watch.serialNumber`, Cal., reception date, and `PhysicalTag.shortCode`.
- Cal. uses `Repair.movementCaliber.name`, then `Watch.caliber.name` when the former is absent.
- QR is 28 mm square in the PDF. The generated image includes a four-module quiet zone.
- Each visible field has one reserved line; long human-readable values end with an ellipsis within that line. Present field categories remain printed, and the QR stays 28 mm.

## Software verification

- Rendered a B2B label with long company, model, partner reference, end-user, Ref., serial, and Cal. values using React-PDF. The generated PDF has exactly one `/Page` and `/MediaBox` 175.748 × 212.598 pt (62 × 75 mm).
- Checked B2B/B2C field selection, Cal. fallback, and exact `qrToken` payload in the label transformation.
- Focused PhysicalTag / label tests: 7/7 PASS.
- TypeScript (`tsc --noEmit --incremental false`) PASS and `git diff --check` PASS.
- Production build (`prisma generate` + `next build`) PASS; static pages 56/56.
- Post-review layout regression: focused tests 8/8 PASS (including rendered long B2B PDF), TypeScript and `git diff --check` PASS. The post-review build could not complete in this environment: `npm run build` could not find the Prisma command shim, and direct `next build` stopped at `spawn EPERM`.

## Hardware validation

- 2026-10-03 hardware PoC passed with Brother QL-800 + DK-2205 continuous 62 mm media at 75 mm cut length. Auto-cut worked and a printed test QR was read back exactly with the BC-NL3000U-W scanner.
- The PoC establishes the printer / media / cut / QR round-trip path. A final physical reprint of this application-specific 62 × 75 mm layout remains the last visual check for margins, Japanese readability, and field balance.

Production: pending. Review後の修正は未push。merge / deployは未実施。独立レビュー後にproduction反映判断を行う。
