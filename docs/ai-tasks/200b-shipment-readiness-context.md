# Task200B — 発送準備情報と同一顧客の他個口

Status: local implementation complete; Production: pending

## Scope

- 既存の`/shipments`一覧に、各Repairのactive保管場所（name / shortCode / type）とactive PhysicalTagのshortCodeを表示する。`releasedAt = null`のassignmentのみ既存Shipment queryのnested selectで取得する。qrTokenは取得・表示しない。
- 同じ一覧で取得済みのOUTBOUND・未発送・未取消Shipmentから、同一Customerの他個口と各個口に含まれるRepairの問い合わせ番号を表示する。現在のShipment自身、別顧客、INBOUND、取消、実発送済みは除外する。
- 両方に`plannedShipDate`があれば、現在の個口を基準とした暦日差を表示する。どちらかが未設定なら比較不可と示す。距離の閾値、順位、統合可否判定は設けない。
- Task200AのRepair.status / 作業完了数、納品書、送り状発行、配達希望、発送予定区分、DRAFT計画編集を維持する。labelIssuedAtがあれば日本時間の発行日時を表示し、配達希望時間帯の未設定も明示する。ランニングテスト完了は引き続き「判定不可」。

## Boundary

既存Shipmentに未紐付けのRepairは探索しない。schema / migration / seed / Supabase / RLS / GRANT、新API、ShipmentまたはRepairの状態変更、StorageLocation / PhysicalTagの変更・release、Shipment統合、ScanSession、CSV、tracking、LINE、発送・配達処理は対象外。

## Validation

- focused Shipment regression: 20/20 PASS。sandbox内のNode test runnerは`spawn EPERM`でテスト本体を開始できず、読み取り専用の権限昇格実行で確認した。
- `npx --no-install tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- `npm run build`: PASS（Next.js 15.5.27、static pages 56/56）

認証済み画面の実データ表示は未確認。production変更は未実施。
