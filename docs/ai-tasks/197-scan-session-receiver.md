# Task197 — Common scan receiver / ScanSession

Status: production complete
Date: 2026-10-02

## Production record

- Application commit: `684a5cff462f2b3713e7ee67993d12fb7946530a`
- Commit subject: `feat: add scan session receiver`
- Railway deployment: `54274dcf-d047-4dc3-92e6-b2e63295c55b`
- Deployment status: `SUCCESS`
- Production tag: `production-task197-20261002`
- Runtime: Next.js Ready in 347ms
- Schema / migration / RLS / GRANT changes: none

## Implemented

App-level authenticated ScanSession foundation:

- keyboard-wedge/HID global capture
- visible manual-input fallback
- existing `POST /api/physical-tags/resolve` as the canonical resolver
- no Web NFC dependency
- no R65-specific format assumptions

Stable scan modes:

- `OPEN_REPAIR`
- `TIMER`
- `BATCH_SELECT`
- `DELIVERY_NOTE`
- `SHIPMENT_SELECT`

### Safety behavior

- NOT_FOUND, RETIRED, UNASSIGNED and AMBIGUOUS are explicit non-action results
- duplicate Repair scans are not added twice
- DELIVERY_NOTE and SHIPMENT_SELECT block mixed-customer selection
- BATCH_SELECT may contain multiple customers
- TIMER scan only creates a candidate; explicit confirmation is required before timer start/switch
- scan alone does not create a delivery note, Shipment, Repair status change, or other irreversible mutation
- mode change clears transient queue/candidate/selection state
- stale generation results cannot update the new mode state

### Continuous scan protection

- FIFO pending-scan queue
- bounded to 16 pending scans plus one in-flight scan
- accepted scans are not silently discarded while resolver requests are in progress
- exact trimmed raw value is debounced for 750ms after acceptance to suppress reader repeats
- keyboard wedge requires scanner-fast character timing and Enter termination
- manual input remains available when hardware suffix behavior differs

## Verification

Final independent verification after queue/debounce fixes:

- Task197 + PhysicalTag regression: 28/28 PASS
- TypeScript: PASS
- `git diff --check`: PASS
- `npm run build`: PASS
- known existing `/api/repairs/recent` Dynamic server usage message appeared during build but build exited 0

Production smoke:

- `GET /` = 200
- `GET /login` = 200
- unauthenticated `GET /repairs` = 307
- unauthenticated resolver valid JSON = 401
- unauthenticated resolver malformed JSON = 401
- unauthenticated WorkTimer active = 401
- unauthenticated WorkTimer start = 401

No production Repair/timer mutation smoke was performed.

## Task boundary

Task197 did not:
- add schema or persisted ScanSession
- implement StorageLocation
- create delivery notes
- create Shipments
- change Repair status
- define R65 byte order/HEX/DEC/prefix/suffix
- alter PhysicalTag issuance/label behavior
