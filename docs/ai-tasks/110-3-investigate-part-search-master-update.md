# Task 110-3: Web検索中に判明した部品情報をPartsMasterへ保存する最終設計

## 目的

Phase 2 部品Web検索の次Taskとして、Web検索中に判明した部品情報を `PartsMaster` へ保存するための最終設計を行う。

今回は調査・設計Taskであり、Prisma schema変更、migration、API実装、PartsWebSearchPanelからの保存UI実装は行わない。

## 対象フロー

修理実務では以下の流れが頻繁に発生する。

1. 交換部品は分かっている
2. ただし部品番号が分からない
3. 部品名でWeb検索する
4. eBay / Cousins UK / その他販売ページで商品ページを見つける
5. 商品ページでメーカー部品番号が判明する
6. その場でPartsMasterへ部品番号を登録する
7. 登録直後に、その部品番号を使って再検索する

このフローを `PartsWebSearchPanel` 内で完結できるようにする。ただし、Panelを完全なPartsMaster編集画面にはしない。

## 1. PartsMasterのpartRef現行構造

現行schemaでは `PartsMaster.partRefs` が存在する。

```prisma
model PartsMaster {
  id        Int     @id @default(autoincrement())
  partRefs  String?
}
```

実際には `partRefs` は nullable string で、コメント上はカンマ区切り複数対応の部品Refとして扱われている。

現行コード上の扱い:

- `PartsForm` では単一のtext inputとして編集する
- `/api/parts` POST と `/api/parts/[id]` PUT は `createOrUpdatePartsMaster` へ渡す
- `createOrUpdatePartsMaster` は `cleanText(input.partRefs)` で空文字を `null` にする
- `findExistingPartsMaster` は `splitMultiValue(data.partRefs)` で複数値を分割し、`normalizeRefToken` で重複判定する
- `splitMultiValue` はカンマ、改行、日本語読点系で複数値を扱う意図がある
- `normalizeRefToken` は空白、ハイフン、ピリオド、スラッシュを除去して小文字化する

結論: partRefだけなら、既存schema変更なしで安全に保存可能。ただし `partRefs` は構造化テーブルではないため、source/status単位の証拠管理はできない。

## 2. Web検索対象PartsMaster.idを特定できるか

Web検索から `partRef` を保存する対象は、原則として実部品レコードである `PartsMaster` に限定する。

混同してはいけないもの:

- `partsMasterId`: `PartsMaster.id`
- `selectedPartId`: UI上の選択候補や一時値であり、必ずしも正式名ではない
- `standardPartNameId`: `PartNameMaster.id`
- `targetPartNameId`: 作業対象部品名としての `PartNameMaster.id`

`PartNameMaster` は標準部品名マスタであり、部品番号や在庫・仕入・発注の保存先ではない。

現状:

- `RepairLineItem` には `partsMasterId` がある
- `RepairEntryForm` の明細行stateにも `partsMasterId` がある
- `PartsSearchPanel` の検索結果はPartsMaster候補を返し、選択時に `partsMasterId` を明細へ入れる
- 110-1時点の `PartsWebSearchPanel` には `partsMasterId` が渡っていない

次実装で必要な最小接続:

- `RepairEntryForm` から `PartsSearchPanel` へ `initialPartsMasterId={activePartsPanelLineItem?.partsMasterId}` を渡す
- `PartsSearchPanel` から `PartsWebSearchPanel` へ `partsMasterId` を渡す
- `PartsWebSearchPanel` の保存UIは `partsMasterId` がある場合だけ有効化する

対象PartsMaster.idがない場合、次実装では新規PartsMasterを作らない。重複や誤分類を避けるため、保存UIは「PartsMaster未選択」として無効化する。

## 3. partRefだけならschema変更なしで実装可能か

可能。

理由:

- `PartsMaster.partRefs` が既に存在する
- 複数番号は文字列内の区切り値として既に扱われている
- `PartsForm` でも既存編集可能
- `/api/parts/search` でも `partRefs contains keyword` による検索対象になっている
- RepairLineItem snapshotを変更しなくても、PartsMaster側の検索性だけ改善できる

ただし、保存方法は「置換」ではなく「追記merge」にするべき。

推奨merge仕様:

- 入力値をtrimする
- 空文字は拒否またはno-opにする
- 既存 `partRefs` を複数値へ分解する
- 入力値も複数値へ分解する
- `normalizeRefToken` で同一判定する
- 新規値だけ末尾へ追加する
- 既存表記は保持する
- 既存値を消さない
- `null` は新規値だけで初期化する

## 4. 既存PUTを使うべきか

推奨しない。

`PUT /api/parts/[id]` は現状、PartsMaster全体更新の入口である。

既存PUT流用のリスク:

- payloadに含まれないfieldを意図せず空値で上書きする危険がある
- `createOrUpdatePartsMaster` の重複解決・正規化ロジックを通るため、Web検索中の小さな追記には重い
- price / stock / supplier / name / cal / brand など、今回触らないfieldまで扱う必要が出る
- Panel側が完全なPartsMaster編集画面に近づく
- UIからの小更新でRepair保存時の同期処理と責務が混ざる

結論: 既存PUTはPartsForm用に維持し、Web検索中の部品情報保存には使わない。

## 5. 推奨更新API

推奨は専用endpoint。

```text
PATCH /api/parts/[id]/search-info
```

初期実装のpayloadは最小にする。

```ts
type UpdatePartSearchInfoRequest = {
  partRefs?: string
}
```

初期実装で更新するfield:

- `PartsMaster.partRefs` のみ

初期実装で更新しないfield:

- `nameJp`
- `nameEn`
- `cousinsNumber`
- `notes1`
- `notes2`
- `supplierId`
- `costOriginal`
- `latestCostYen`
- `retailPrice`
- `stockQuantity`
- `standardPartNameId`
- `gradeId`

レスポンス例:

```ts
type UpdatePartSearchInfoResponse = {
  part: {
    id: number
    partRefs: string | null
    nameJp: string
    nameEn: string | null
    partType: string | null
    standardPartNameId: string | null
  }
  addedPartRefs: string[]
  skippedPartRefs: string[]
}
```

実装候補ファイル:

- `src/app/api/parts/[id]/search-info/route.ts`
- `src/lib/parts-master-search-info.ts`

`parts-master-search-info.ts` には `splitPartRefs` / `normalizePartRefForCompare` / `mergePartRefs` / `updatePartsMasterSearchInfo` のような小さな関数を置く。

## 6. 保存UI案

`PartsWebSearchPanel` 内に小さな「部品情報」領域を追加する。

初期実装ではpartRefだけに絞る。

表示例:

```text
部品情報
対象PartsMaster: #123 / ETA 7750 / 切替車
現在の部品番号: 未登録
[部品番号 ________] [保存]
```

保存成功後の流れ:

1. `PATCH /api/parts/[id]/search-info` 成功
2. Panel内local stateの `partRef` / `partRefs` を更新
3. `PartSearchContext.partRef` が更新される
4. profile queryが自動再生成される
5. 直後に `ETA 7750 8610` などで再検索できる

ただし、次実装ではRepairLineItem snapshotを自動更新するかは慎重に扱う。

推奨:

- PartsMaster側の `partRefs` は更新する
- Panel内の検索contextは即時更新する
- 既存RepairLineItem snapshotは自動更新しない
- 必要なら「この明細にも反映」操作を別ボタンにする

## 7. RepairLineItem snapshotとの関係

`RepairLineItem` は `partsMasterId` を持つ一方で、表示名などはsnapshotとして保持している。

重要方針:

- PartsMasterへpartRefを追加しても、過去のRepairLineItem snapshotを勝手に更新しない
- 修理明細上の表示名や過去見積の意味を変えない
- 現在編集中のPanelでは、検索contextだけ更新して再検索しやすくする
- 明細へ部品番号を反映する操作は、PartsMaster更新とは別操作として扱う

現行のRepair保存APIには、明細保存時にPartsMasterへ同期する処理がある。これは修理保存時の既存挙動として残すが、Web検索中の小更新APIとは責務を分ける。

## 8. 部品番号がまだPartsMasterに存在しないケース

次実装では、Web検索で部品番号が分かったからといって新規PartsMasterを自動作成しない。

理由:

- Cal / baseCal / movementMaker / category / PartNameMaster との関係が不足していると重複しやすい
- Web販売ページ由来の情報はPROVISIONAL相当であり、VERIFIEDではない
- 既存schemaにはPROVISIONAL / sourceType / evidenceを保存する構造がない
- 「検索対象になっている実部品」と「標準部品名」を混同しやすい

次実装では、既存PartsMaster.idがない場合は以下の表示に留める。

- `PartsMaster未選択のため保存できません`
- `先に部品候補を選択するか、PartsMaster登録画面で作成してください`

PROVISIONAL PartsMaster新規作成はPhase B以降で扱う。

## 9. manufacturer original nameの現状と不足

現行schemaで関連しそうなfield:

- `PartsMaster.nameJp`
- `PartsMaster.nameEn`
- `PartsMaster.name`
- `PartNameMaster.nameJa`
- `PartNameMaster.nameEn`
- `PartNameMaster.displayJa`
- `PartNameMaster.displayEn`
- `notes1`
- `notes2`

現行fieldの意味:

- `PartNameMaster.*`: 標準部品名の表示・検索補助として使う
- `PartsMaster.nameJp/nameEn`: 実部品レコードの日本語/英語名として使う
- `PartsMaster.name`: legacy互換
- `notes1/notes2`: 備考であり、構造化されたメーカー純正名ではない

結論:

- 既存 `nameEn` を勝手に manufacturer original name と再定義しない
- Web販売ページの名称を `nameEn` へ自動保存しない
- メーカー純正名を正式に扱うなら、新fieldまたは別tableが必要

将来案:

```prisma
model PartSourceName {
  id            Int    @id @default(autoincrement())
  partsMasterId Int
  lang          String?
  name          String
  sourceType    String
  status        String
}
```

ただし次実装では採用しない。

## 10. search aliasの現状と不足

現行の `PART_NAME_EN_ALIASES` はコード内fallbackであり、DBマスタではない。

現行schemaには以下がない。

- PartNameMaster.searchKeywords
- PartsMaster.searchAliases
- PartSearchAlias table
- aliasごとのlang/source/status

結論:

- 次実装ではsearch aliasをDB保存しない
- `partRef` 保存だけを優先する
- alias DB化は、PartNameMaster側に置くか、PartsMaster側に置くか、別tableにするかをPhase Bで比較する

将来方針:

- メーカー横断の一般aliasはPartNameMaster側
- Cal固有・メーカー固有aliasはPartsMaster側または別table
- source/statusを持つなら別tableが安全

## 11. PROVISIONAL / VERIFIEDに必要な変更

現行schemaには PartsMaster / PartNameMaster 用の `reviewStatus` / `sourceType` / `verified` 相当がない。

Web販売ページで見つけた部品番号は、少なくとも初期状態ではPROVISIONAL相当として扱うべきだが、現行schemaでは構造化して保存できない。

将来の比較対象:

### A. PartsMasterにstatus/source fieldを追加

例:

```prisma
verificationStatus String?
sourceType String?
```

メリット: 実装が単純。デメリット: 部品番号・名称・aliasごとのsource/statusを分けにくい。

### B. 部品情報source/evidence tableを追加

例:

```prisma
model PartEvidence {
  id            Int @id @default(autoincrement())
  partsMasterId Int
  field         String
  value         String
  sourceType    String
  sourceUrl     String?
  status        String
}
```

メリット: partRef単位、名称単位、alias単位でsource/statusを扱える。デメリット: 初期実装がやや重い。

推奨: Phase Aではschema変更なし。Phase Bで `PartEvidence` 系の別tableを優先検討する。

## 12. 情報源管理の最小案

将来的なsourceType候補:

- manufacturer_document
- supplier_page
- marketplace
- actual_watch
- manual_input
- other

次実装の最小案:

- DBにはsourceTypeを保存しない
- UI上は「Web検索中に手入力した部品番号」として扱う
- 必要なら `internalMemo` や `notes` へ自動追記しない
- source URL保存はしない

理由: partRef追記だけのために巨大なprovenance systemを作らないため。

## 13. 次Taskで実装する最小範囲

次の実装TaskはPhase Aとして、以下に限定する。

### API

- `PATCH /api/parts/[id]/search-info`
- 更新対象は `partRefs` のみ
- merge追記のみ。既存値削除・全置換はしない
- idが存在しない場合は404
- 空入力は400またはno-op 200のどちらかに統一する。推奨は400
- 重複値は `skippedPartRefs` として返す

### Client

- `RepairEntryForm -> PartsSearchPanel -> PartsWebSearchPanel` に `partsMasterId` を渡す
- `PartsWebSearchPanel` にpartRef保存欄を追加する
- `partsMasterId` がない場合は保存不可表示にする
- 保存成功後、Panel内contextを更新し、検索語を自動再生成する
- 個別open / 一括openは更新後のqueryを使う

### 実装しないこと

- PartsMaster新規作成
- RepairLineItem snapshot自動更新
- nameEn保存
- cousinsNumber保存
- manufacturer original name保存
- search alias保存
- source/status保存
- schema変更

## 14. リスク

- `partRefs` がstringなので、個別部品番号ごとのsource/statusを持てない
- 既存PUTを流用すると意図しないfield上書きが起こり得る
- 対象PartsMaster.idがない状態で新規作成すると重複しやすい
- Web販売ページ由来の情報をVERIFIED扱いに見せると精度誤認が起こる
- RepairLineItem snapshotを自動更新すると、過去明細の意味が変わったように見える可能性がある
- 現行 `nameEn` をmanufacturer original nameとして使うと、標準英語名・検索alias・純正名が混ざる

## 15. 結論

次実装では、既存PartsMasterが特定できる場合に限り、Web検索Panelから `PartsMaster.partRefs` へ部品番号をmerge追記できる最小機能を作る。

推奨APIは `PATCH /api/parts/[id]/search-info`。

このAPIは既存PUTを流用せず、`partRefs` のみを対象にする。保存後はPanel内の検索contextを更新して、部品番号入りqueryで即再検索できるようにする。

PROVISIONAL / VERIFIED、manufacturer original name、search alias、sourceType、source URL は今回の既存schemaでは確定保存せず、Phase Bのschema設計へ送る。