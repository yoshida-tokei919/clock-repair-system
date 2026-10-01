# Task196D — PhysicalTag issuance and QR label flow

Status: software production complete
Date: 2026-10-01

## Production record

- Application commit: `07a62846ca77c12faf7160457f354d4e929440bf`
- Commit subject: `feat: add physical tag label flow`
- Railway deployment: `29270eee-e41f-4c1c-b591-2823860d6e6a`
- Deployment status: `SUCCESS`
- Production tag: `production-task196d-20261001`
- Runtime: Next.js Ready in 294ms
- Schema / migration / RLS / GRANT changes: none

## Implemented

- authenticated `POST /api/physical-tags/issue`
- `PT-000001` style human-readable shortCode derived from PhysicalTag id
- cryptographically random opaque qrToken
- optional NFC UID using the existing conservative hex normalization contract
- one Serializable transaction for issue → shortCode finalize → Repair assignment
- actual authenticated Admin audit id
- Repair detail PhysicalTag management panel
- 62×29mm PDF label baseline
- label text: inquiry number, customer/partner display name, brand, model, Ref, received date, TAG shortCode
- QR payload is exactly qrToken
- removed legacy `/api/print-tag` hard-coded printer path
- removed legacy Repair-ID / inquiryNumber QR paths

No Repair status, Shipment, ScanSession, LINE, or NDEF coupling was added.

## Verification

- focused Task196D tests: 5/5 PASS
- PhysicalTag regression: 20/20 PASS
- TypeScript: PASS
- `git diff --check`: PASS
- `npm run build`: PASS
- production smoke: root/login 200, unauthenticated issue valid/malformed 401, legacy print-tag 404

## Hardware validation pending

Brother printer real-device validation remains pending until the printer arrives.

Validate:
- actual 62×29mm media fit
- margins / clipping
- text size/readability
- QR scan reliability
- bag attachment workflow
- repeated printing alignment

Any resulting layout adjustment should be treated as a focused follow-up, not mixed into Task198.
