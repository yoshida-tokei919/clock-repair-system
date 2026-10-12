# Task204A - Japan Post tracking read-only poller

Status: local implementation and validation. Production: pending.

## Boundary

- `GET /api/internal/japan-post-tracking` reads at most five existing Shipment rows. It requests official tracking sequentially, once per distinct tracking number, and returns only `shipmentId`, `trackingNumber`, and a read-only result or error.
- Candidates must be OUTBOUND, have `carrierCode=JAPAN_POST`, a nonempty tracking number, and one of LABEL_ISSUED, AWAITING_ACCEPTANCE, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, or EXCEPTION. DRAFT, READY, DELIVERED, and CANCELLED are excluded. Only 12-digit numbers reach Japan Post.
- No Shipment or Repair writes, timestamp conversion, schema changes, LINE, UI, PDF, payment, or Yu-Pri Cloud issuance worker changes. Task204B owns any later persistence.

## Official evidence

- [Japan Post individual-number search](https://trackings.post.japanpost.jp/services/srv/search/input) uses `GET /services/srv/search` with `requestNo1` and `locale=ja`. The [tracking service](https://trackings.post.japanpost.jp/services/srv/search/) warns that tracking updates can be delayed.
- An independent reviewer inspected a current official result with a GET-only request. The inquiry table has the verified delivery-status-detail summary, a header row for inquiry number and product type, then a separate data row with the echoed number and product type. The history table has the verified history-information summary. Its two-row header contains state date, delivery history, detail, handling office, and prefecture, then postal code. Each event likewise uses two rows: date/time, status, detail, office, and prefecture on the first row, with postal code on the second. Four cells span both event rows. The observed events were chronological. No real number or HTML was saved.
- During the Task204A review, the reviewer checked the official Japan Post [Yu-Pri Cloud Operation Manual PDF](https://www.post.japanpost.jp/yu-pri-cloud/member/VariousContents/%E3%82%86%E3%81%86%E3%83%97%E3%83%AA%E3%82%AF%E3%83%A9%E3%82%A6%E3%83%89%E6%93%8D%E4%BD%9C%E8%AA%AC%E6%98%8E%E6%9B%B8.pdf) from the [member page](https://www.post.japanpost.jp/yu-pri-cloud/member/). The PDF identifies itself as Yu-Pri Cloud Operation Manual Ver3.1, dated 2026-04-15. Section III, Table 3.1 on page 38 establishes the delivery-status meanings. The issued-data tracking/delivery-status screen on page 40 links the tracking number to Japan Post individual-number search and displays delivery status.
- The manual distinguishes origin-office acceptance, transit, delivery-office arrival, out for delivery, recipient delivery, recipient pickup at a post office, absence/hold/forwarding/investigation, and return to sender. Recipient pickup at a post-office counter is DELIVERED; return completion remains EXCEPTION. Label issuance or the manual's not-shipped state is not acceptance.

## Fail-closed contract

- HTTPS, exact official host, and `/services/srv/search` path family are required. Redirects are followed manually and the destination and final response URL are checked. The request has a ten-second timeout and a 512 KiB HTML limit.
- Exactly one inquiry table must have the expected two-row header/value layout and echo the requested 12-digit number. Exactly one history table must have the verified two-row header. Every event must have the verified two-row rowspan layout. A mismatch, extra or missing row/cell, unexpected header, unknown latest status, or missing history yields an explicit error.
- Raw date/time, status, detail, office, prefecture, and postal-code text is preserved. No timezone or `Date` is inferred. The final reconstructed event is treated as the current state.
- The existing Yu-Pri status-description normalization is reused. Live-page aliases stay in the tracking adapter. Unknown or unavailable information never becomes a normal delivery state. No full HTML or customer PII is logged.

## Validation

- Synthetic, sanitized two-row fixtures cover acceptance, transit, out for delivery, recipient delivery, post-office pickup, return completion, other exception, not found, mismatch, unknown status, and malformed rowspan/header/event structures.
- Focused tests also cover upstream 5xx and unsafe redirect behavior, URL restrictions, read-only candidate selection, request deduplication, internal token authentication, and existing Yu-Pri history regression.
- Focused Task204A and Yu-Pri history tests: 20/20 PASS. TypeScript `--noEmit --incremental false`: PASS. `git diff --check`: PASS. `npm run build` was rerun after the parser corrections and PASSED, generating 59 static pages and including `/api/internal/japan-post-tracking`. Production remains pending.
