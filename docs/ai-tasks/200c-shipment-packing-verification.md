# Task200C — PhysicalTag連続scanによるShipment梱包照合

Status: production complete — 2026-10-03

## Scope

- ScanSessionへ `SHIPMENT_PACKING` modeを追加。
- 発送IDから既存のauthenticated `GET /api/shipments/[id]` をread-only取得し、ShipmentRepairのRepair集合を梱包期待値として扱う。
- PhysicalTag / PTコード / QR token等は既存resolverでRepairへ解決し、Shipment所属Repairはmatched、Shipment外Repairはmismatchとして記録する。
- 同一Repairの再scanはmatched / mismatchのどちらでもduplicate扱いとし、二重登録しない。
- 未登録 / 廃止 / 未割当 / ambiguous tagは既存ScanSessionのerror contractを維持する。
- 全期待Repairがmatchedかつmismatch 0件の場合のみ最終確認を許可する。
- confirm時にShipmentを再GETし、Repair集合、customer、direction、status、actualShippedAtのsnapshot変更を検出した場合はfail closedで最初から再確認する。
- mode変更、発送ID変更、clear、再GETの競合ではgeneration / request ID guardでstale responseを破棄する。

## Boundary

- scan / confirmのみではShipment / ShipmentRepair / Repair / PhysicalTag / StorageLocationを更新しない。
- Shipment作成、Shipment merge、status遷移、tracking、labelIssuedAt、CSV、LINEは変更しない。
- PhysicalTag releaseはTask200Dへ分離する。
- schema / migration / seed / Supabase / RLS / GRANT変更なし。
## Validation

- focused + ScanSession regression: 18/18 PASS。
- `npx --no-install tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Windows localの正式 `npm run build` は既存 `query_engine-windows.dll.node` のfile lockによるPrisma `EPERM` で停止。
- Prisma生成を迂回した `npx --no-install next build` はPASS、static pages 56/56。
- Railway production buildは `prisma generate && next build` が完全PASS、static pages 56/56。
- independent review: blocking findingなし。Task200Aのeligible shipment条件（OUTBOUND / actualShippedAt=null / status!=CANCELLED）との整合を確認。

## Production

- Application commit: `24565e8c5501507f2033dd12280ee80dd1911b91`
- Commit subject: `feat: add shipment packing verification`
- Deploy source: GitHub `main` → Railway
- Railway deployment: `8a7729dc-2ed9-4845-80b3-7c11ad97e969` — SUCCESS
- Production tag: `production-task200c-20261003`
- Region: `sin`
- Runtime: Next.js 15.5.27, Ready in 327ms
- Supabase migration: none; schema / migration / production DB mutationなし
- Production smoke: `/`=200、`/login`=200、`/shipments`未認証=307、`/repairs`未認証=307、`GET /api/shipments/1`未認証=401。Railway HTTP logsの`upstreamErrors`なし。

## Next

Task200D（発送前PhysicalTag release確認）は未着手。
Task201は`task/201A`で実装・独立レビュー済み。main統合 / productionはpending。
