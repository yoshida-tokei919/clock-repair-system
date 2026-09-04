# 110-4 Web検索中に判明した部品番号をPartsMasterへ追記する実装

## 目的

Phase 2 部品Web検索の次Taskとして、Web検索中に判明した部品番号を既存 `PartsMaster.partRefs` へ追記し、保存直後にその部品番号を使って検索語を再生成できるところまで実装する。

## 実装範囲

- `RepairEntryForm -> PartsSearchPanel -> PartsWebSearchPanel` へ `partsMasterId` を渡す
- `PATCH /api/parts/[id]/search-info` を追加する
- 更新対象を `PartsMaster.partRefs` のみに限定する
- 既存 `partRefs` を消さずに merge 追記する
- 重複番号は追加せず `skippedPartRefs` として返す
- `PartsWebSearchPanel` に部品番号保存UIを追加する
- 保存成功後、入力した部品番号を active partRef として検索contextへ即時反映する
- `PartsMaster` 未選択時は保存UIのみ無効化し、Web検索自体は継続可能にする

## 実装しないこと

- Prisma schema変更
- migration作成
- PartsMaster新規作成
- RepairLineItem snapshot自動更新
- `nameEn` / `cousinsNumber` 保存
- manufacturer original name保存
- search alias DB保存
- `sourceType` / `PROVISIONAL` / `VERIFIED` 保存
- 既存 `PUT /api/parts/[id]` の流用または仕様変更
- `docs/ai/02_PRODUCT_ROADMAP.md` 更新

## 変更内容

### API

`PATCH /api/parts/[id]/search-info`

Request body:

```json
{
  "partRefs": "8610"
}
```

Response:

```json
{
  "part": {
    "id": 1,
    "partRefs": "8610, 8611",
    "nameJp": "...",
    "nameEn": null,
    "partType": "interior",
    "standardPartNameId": "..."
  },
  "addedPartRefs": ["8611"],
  "skippedPartRefs": []
}
```

Status:

- `400`: id不正、JSON不正、空の `partRefs`
- `404`: 対象 `PartsMaster` が存在しない
- `200`: 保存成功または既存重複のみ

### merge rule

- `partRefs` は nullable string のまま扱う
- 入力は trim し、改行・半角カンマ・全角カンマで分割する
- 比較時のみ空白・ハイフン・ドット・スラッシュを除去し、小文字化する
- DB保存時は既存表記を維持し、新規番号だけ末尾へ `, ` 区切りで追記する
- 重複番号は `skippedPartRefs` に入れて保存値を変えない

例:

- `null` + `8610` -> `8610`
- `8610` + `8610` -> `8610`
- `8610, 8611` + `8612` -> `8610, 8611, 8612`
- `86-10` + `8610` -> `86-10`

### UI

`PartsWebSearchPanel` に「部品情報」欄を追加した。

- `PartsMaster #id`
- 現在の `partRefs`
- 検索に使用中の active partRef
- 判明した部品番号の入力欄
- 保存ボタン
- 保存中・保存成功・保存失敗の表示

`partsMasterId` がない場合は、番号保存欄を disabled にし、「PartsMaster未選択のため番号保存はできません」と表示する。Web検索機能自体は止めない。

### 保存直後のquery更新

保存成功後は API から返る `part.partRefs` を表示用の保存済み番号として更新し、検索contextには「今回追加した番号」を active partRef として入れる。

重複保存時など `addedPartRefs` が空の場合も、入力値の先頭番号を active partRef として使う。

これにより、DB上の `"8610, 8611"` 全体を1つの検索語として扱わない。

### snapshot非変更

今回の API は `PartsMaster.partRefs` のみを更新し、`RepairLineItem` および以下の snapshot は更新しない。

- `itemNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

## 検証

- `npx tsc --noEmit --pretty false --incremental false`
- `npx tsx -e` による `mergePartRefs` / `updatePartsMasterSearchInfo` の軽量確認
- `npm run build`
- `git diff --check`

## 次Task候補

Web検索で見つけた情報をPartsMasterへ保存する対象を、`partRefs` 以外に拡張するためのDB設計を行う。

候補:

- manufacturer original name
- search alias
- sourceType / status
- Web販売ページ由来情報とTechnicalDocument由来情報の証拠レベル整理
- PROVISIONAL / VERIFIED への昇格条件
