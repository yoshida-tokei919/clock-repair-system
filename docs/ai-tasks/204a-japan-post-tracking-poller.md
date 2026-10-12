# Task204A - Yu-Pri Cloud tracking CSV read-only poller

Status: production complete. Automatic tracking activation and real-shipment E2E remain pending.

## Decision

The initial production implementation at `f782eb49` queried Japan Post individual tracking and parsed HTML. Production smoke proved that approach brittle and it is superseded by this Task204A correction. Delivery state is no longer derived from Japan Post tracking-page DOM.

The canonical source for Task204A is the CSV exported from Yu-Pri Cloud `発行後` data. Browser automation is used only to operate the authenticated Yu-Pri Cloud UI and download the CSV. Delivery state itself is derived exclusively from the official CSV status-code fields.

The abandoned local HTML correction `290959f` is not part of this implementation.

## Official evidence

- Japan Post `ゆうプリクラウド操作説明書 Ver3.1` (2026-04-15) documents issued-label management in `発行後`, the delivery-status categories, and CSV download through a registered output filter.
- The manual's issued-data download flow is: select issued rows -> `ダウンロード` -> choose registered `出力フィルタ` -> download CSV.
- The existing production `src/lib/yupuri-history.ts` transcribes the official Yu-Pri delivery status aggregate/detail code table from the Japan Post Yu-Pri interface specification. Task204A reuses that single code table rather than creating a Cloud-specific duplicate.
- The Cloud output filter for this workflow is expected to export the same six fields already validated by the Yu-Pri history parser: お客様側管理番号, お問い合わせ番号, 仮引受確定作業年月日, 配送完了作業年月日, 配達ステータス集約コード, 配達ステータス明細コード.

## Browser boundary

- Existing dedicated Edge, existing Yu-Pri Cloud login/session handling, service-hours guard, and single-tab topology checks are reused.
- The read-only `--tracking-preview --once` worker mode opens `発行後`, selects only rows containing one canonical `SHP-{Shipment.id}` token, verifies the next-500 pagination control is unambiguous and disabled, opens the CSV download dialog, selects exactly one configured output filter, and downloads the resulting CSV.
- `YUPURI_CLOUD_TRACKING_FILTER_NAME` can name the registered output filter. The code default is `時計修理アプリ配送状況6列`; production configuration is not changed by this Task.
- Shipment state, delivery status text, tracking state, or dates are not scraped from DOM. DOM is used only for the browser actions required to request the official CSV.
- The download is capped at the existing 256 KiB / 500-row parser limits. Ambiguous rows, duplicate SHP numbers, pagination, filters, dialogs, or downloads fail closed.

## App boundary

- `POST /api/internal/japan-post-tracking` accepts only an authenticated internal Cloud-worker request and raw `application/octet-stream` or `text/csv` bytes.
- The existing strict BOM-free CP932 six-column parser is reused. `SHP-{id}` resolves the Shipment, and the CSV tracking number must exactly match the Shipment tracking number.
- Active read-only candidates are OUTBOUND Japan Post Shipments in LABEL_ISSUED, AWAITING_ACCEPTANCE, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, or EXCEPTION.
- DRAFT, READY, DELIVERED, CANCELLED, INBOUND, missing Shipment, tracking conflicts, unknown/undescribed codes, duplicate rows, and malformed CSV do not become synchronization candidates.
- Task204A performs no Shipment, Repair, status, timestamp, LINE, shared-page, schema, migration, RLS, GRANT, or production DB mutation. Task204B owns persistence.

## Status normalization

The existing official code map remains canonical: `引受予定 -> AWAITING_ACCEPTANCE`, `引受 -> SHIPPED`, transport/arrival states -> `IN_TRANSIT`, `持出中 -> OUT_FOR_DELIVERY`, recipient delivery / post-office counter handoff -> `DELIVERED`, and hold/absence/transfer/return/investigation states -> `EXCEPTION`. Unknown pairs remain fail-closed.

The two 14-byte date fields remain raw strings in Task204A. A real non-empty Cloud CSV sample has not yet been observed, so Task204A does not infer a timestamp format.

## Local validation

- App CSV preview + existing Yu-Pri history + browser safety regression: 39/39 PASS.
- Browser helper synthetic test verifies that only canonical SHP rows are selected, the configured output filter is chosen, and downloaded bytes are returned without reading delivery state from DOM.
- TypeScript `--noEmit --incremental false`: PASS.
- `git diff --check`: PASS.
- Real Yu-Pri Cloud CSV download cannot be exercised while the service is closed. Per the approved plan, live status and post-acceptance verification will be performed with the end-to-end real shipment after Task204E is implemented.

## Review exception

The user explicitly authorized Katari to implement and review Task204A through Task204E while Codex quota is limited. Independent Codex review is therefore intentionally omitted for this sequence. Production deployment and activation remain separate approval points.

## Production completion ? 2026-10-13

- Application commit: `fff2952d27e8668da0c63f4a8c6b757ae6c6c469`.
- Deployed source: GitHub `main` at `2052f218d2268b5fa02fea423020a2324242988d`.
- Railway deployment: `fb00bade-aecb-44bf-a9a0-3e18a23baa01` ? `SUCCESS`, region `sin`.
- Railway build: Prisma Client generation PASS; Next.js 15.5.27 compile / lint / type validation PASS; static generation 59/59 PASS.
- Production runtime: Next.js Ready in 382ms.
- Non-destructive smoke: `/`=200, `/login`=200, unauthenticated `/repairs`=307, `/shipments`=307, invalid `/customer/repairs/...` token=404, unauthenticated `POST /api/internal/japan-post-tracking`=401, unauthenticated `POST /api/internal/japan-post-tracking/sync`=401. Railway HTTP logs showed empty `upstreamErrors` for these smoke requests.
- No schema / migration / RLS / GRANT / environment-variable change was required. Smoke testing made no Shipment / Repair delivery-state mutation and sent no LINE message.
- Persistent `-AllowTrackingSync` remains OFF. The approved real-shipment E2E will confirm the live Cloud CSV, 14-digit timestamp format, acceptance -> LINE -> transport -> out-for-delivery -> delivered -> Repair delivery completion before operational activation.
- Review exception: the user explicitly authorized Katari implementation and review for Task204A-E while Codex quota was limited; independent Codex review was intentionally omitted for this sequence.
