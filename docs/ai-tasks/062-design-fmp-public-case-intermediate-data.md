# AI Task 062: FMP過去データ公開事例用中間データ設計

## 目的

FMP過去データから公開候補2,924修理IDを生成するための中間データ構造を設計する。

この中間データは、将来的にPublicCase系テーブルへ取り込む前段階のデータとする。今回は設計のみで、DB schema、migration、seed、既存マスタ、CSV / Excel本体、通常Repairデータは変更しない。

## 前提

- 対象はFMP過去案件の初期公開候補生成。
- 今後のWEB新規案件の事例公開機能とは混ぜすぎない。
- FMP過去案件を通常Repairへ無理に流し込まない。
- B2B事例とB2C事例は別に扱う。
- B2Bは価格を公開し、技術料と部品代を分けて表示する。
- B2Cは価格を公開しない。
- 顧客名、電話番号、住所、メール、顧客管理番号、内部メモ、備考、連絡事項、取引先情報、仕入価格、原価、利益などは公開候補に出さない。
- 写真は必須ではなく、まずCSVテキストデータだけで候補を整理する。

## 061で確定した候補数

| 項目 | 件数 |
| --- | ---: |
| 内装候補明細 | 2,624 |
| 外装候補明細 | 711 |
| 候補あり修理ID | 2,924 |
| 内装のみ | 2,245 |
| 外装のみ | 477 |
| 内外装両方 | 202 |

## FMP元データの入力項目

FMP CSVはヘッダーなしのため、057の列順を仮ヘッダーとして読む。

公開候補生成で使う入力項目:

```txt
修理ID
受付日
ブランド
モデル名
REF
Cal
内装修理内容1
内装修理技術料1
内装修理内容2
内装修理技術料2
内装修理内容3
内装修理技術料3
外装修理内容1
外装修理技術料1
外装修理内容2
外装修理技術料2
外装修理内容3
外装修理技術料3
外注内容
外注料金
内装部品1
内装部品価格1
内装部品2
内装部品価格2
内装部品3
内装部品価格3
外装部品1
外装部品価格1
外装部品2
外装部品価格2
外装部品3
外装部品価格3
合計金額
```

公開候補には出さない入力項目:

```txt
顧客情報
取引先情報
内部メモ
備考
連絡事項
仕入価格
原価
利益
その他個人情報や内部情報を含む可能性があるもの
```

現CSVには上記の公開対象外フィールドは含めない前提だが、今後別ソースを足す場合も中間データには入れない。

## 中間データ設計方針

- 1修理IDを1つのCase単位にする。
- 修理内容はWorkItem単位に分ける。
- 部品はPartItem単位に分ける。
- 内装WorkItem、外装WorkItem、外注WorkItemを区別できるようにする。
- FMP原文、正規化キー、変換後表示名を分けて持つ。
- 公開可否とレビュー状態は、Case単位とWorkItem単位の両方に持つ。
- B2B用の価格表示フィールドと、B2C用の価格非表示フィールドを分ける。
- CSV / Excel本体を修正せず、読み込み時の突合用キーだけ正規化する。
- PublicCase系テーブルへ取り込む前のスナップショットとして扱う。
- FMP由来であること、生成日時、参照したルールファイルを記録できるようにする。

中間データの候補ファイル形式は、次タスクでJSON LinesまたはCSVを検討する。設計上はネスト構造を持てるJSON Linesが扱いやすい。

## Case単位の中間データ

候補型:

```ts
type FmpPublicCaseCandidate = {
  source: "fmp";
  sourceRepairId: string;
  sourceAcceptedDate?: string;
  generatedAt: string;
  ruleVersion: {
    internalRuleFile: string;
    externalRuleFile: string;
    scriptVersion?: string;
  };
  watch: {
    brand?: string;
    modelName?: string;
    ref?: string;
    cal?: string;
  };
  candidateStatus: "candidate" | "excluded" | "needs_review";
  reviewStatus: "not_reviewed" | "auto_candidate" | "needs_manual_review" | "approved" | "rejected";
  publishTargets: {
    b2bCandidate: boolean;
    b2cCandidate: boolean;
  };
  workItems: FmpPublicCaseWorkItem[];
  partItems: FmpPublicCasePartItem[];
  priceSummary: {
    internalLaborTotal?: number;
    externalLaborTotal?: number;
    subcontractTotal?: number;
    partsTotal?: number;
    total?: number;
  };
  display: {
    b2bTitle?: string;
    b2cTitle?: string;
    b2bSummaryItems: string[];
    b2cSummaryItems: string[];
    publicTags: string[];
  };
  photos: {
    hasPhoto: boolean;
    photoRefs: string[];
    photoReviewStatus: "not_checked" | "not_available" | "available" | "linked";
  };
  exclusionReasons: FmpPublicCaseExclusionReason[];
  notes: {
    publicCommentDraft?: string;
    b2bMemoDraft?: string;
    internalReviewNote?: string;
  };
};
```

Case単位で持つべき主な内容:

- FMP由来の修理ID
- ブランド、モデル名、REF、Cal
- 候補判定結果
- B2B / B2Cそれぞれの候補フラグ
- WorkItemとPartItemの配列
- B2B用価格集計
- B2C用短い表示名・公開タグ
- 写真紐づけ状態
- 除外理由

## WorkItem単位の中間データ

WorkItemは、FMPの `内装修理内容1〜3`、`外装修理内容1〜3`、必要なら `外注内容` を明細化したもの。

候補型:

```ts
type FmpPublicCaseWorkItem = {
  sourceSlot:
    | "internalRepair1"
    | "internalRepair2"
    | "internalRepair3"
    | "externalRepair1"
    | "externalRepair2"
    | "externalRepair3"
    | "subcontract";
  workDomain: "internal" | "external" | "subcontract";
  sourceText: string;
  normalizedSourceText: string;
  sourceLaborPrice?: number;
  ruleMatch: {
    matched: boolean;
    ruleSource: "internal_99_rule" | "external_review_rule" | "none";
    ruleSourceText?: string;
    ruleStatus:
      | "publish_candidate"
      | "exclude_unreviewed"
      | "exclude_not_public"
      | "needs_final_review"
      | "unmatched";
    ruleReason?: string;
  };
  normalizedWorkName?: string;
  category?: string;
  partName?: string;
  action?: string;
  actionDetail?: string;
  attributes?: {
    position?: string;
    material?: string;
    size?: string;
    variation?: string;
  };
  b2bDisplay: {
    label?: string;
    laborLabel?: string;
    laborPrice?: number;
    showPrice: boolean;
  };
  b2cDisplay: {
    label?: string;
    publicTag?: string;
    showPrice: false;
  };
  publishStatus: "candidate" | "excluded" | "needs_review";
  reviewStatus: "auto" | "needs_manual_review" | "approved" | "rejected";
  exclusionReasons: FmpPublicCaseExclusionReason[];
};
```

### 内装修理明細の中間データ構造

内装WorkItemの方針:

- `workDomain` は `internal`。
- ルールは `内装修理_部品名ドリルダウンレビュー用_掲載99件反映版.xlsx` の `掲載判定_全件` を正とする。
- ユーザー確認済み99種類のうち、掲載候補または掲載候補（要最終確認）のみ候補化する。
- 未レビュー221種類は掲載しない。
- `交換` は `交換技術料` とし、作業名側で部品名へ分解しない。
- 交換対象部品はPartItem側の内装部品欄から参照する。

内装WorkItemで特に必要な項目:

```txt
sourceText
normalizedSourceText
normalizedWorkName
category
partName
action
actionDetail
sourceLaborPrice
ruleStatus
b2bDisplay.laborLabel
b2bDisplay.laborPrice
b2cDisplay.label
```

### 外装修理明細の中間データ構造

外装WorkItemの方針:

- `workDomain` は `external`。
- ルールは `外装修理_第3次レビュー候補.xlsx` の確認済み内容を正とする。
- 外装部品、処置、処置詳細、仕上げ例外、掲載対象外リストを使って候補化する。
- 対象部品と処置が確定しているものは候補化する。
- `掲載対象外`、`内装修理へ`、`巻芯は内装へ`、表示名未確定、未確認のものは候補化しない。
- 外装修理価格は自動入力主軸ではなく、FMP過去価格として保持し、B2B表示や参考値に使う。

外装WorkItemで特に必要な項目:

```txt
sourceText
normalizedSourceText
partName
action
actionDetail
attributes.position
normalizedWorkName
sourceLaborPrice
ruleStatus
b2bDisplay.laborLabel
b2bDisplay.laborPrice
b2cDisplay.label
```

## PartItem単位の中間データ

PartItemは、FMPの `内装部品1〜3`、`外装部品1〜3` を明細化したもの。

候補型:

```ts
type FmpPublicCasePartItem = {
  sourceSlot:
    | "internalPart1"
    | "internalPart2"
    | "internalPart3"
    | "externalPart1"
    | "externalPart2"
    | "externalPart3";
  partDomain: "internal" | "external";
  sourcePartName: string;
  normalizedPartName?: string;
  sourcePartPrice?: number;
  relatedWorkItemSlot?: FmpPublicCaseWorkItem["sourceSlot"];
  relationConfidence: "high" | "medium" | "low" | "manual_required";
  b2bDisplay: {
    label?: string;
    partPrice?: number;
    showPrice: boolean;
  };
  b2cDisplay: {
    label?: string;
    showPrice: false;
  };
  reviewStatus: "auto" | "needs_manual_review" | "approved" | "rejected";
  exclusionReasons: FmpPublicCaseExclusionReason[];
};
```

PartItemの方針:

- B2Bでは部品代を表示できるように価格を保持する。
- B2Cでは価格を出さず、必要なら交換部品名だけを表示する。
- WorkItemとの対応が曖昧な場合は自動配分しない。
- 交換部品複数に対して技術料が1つの場合は `manual_required` とする。
- 内装の `交換` では、作業名を部品名に分解せず、PartItem側で部品名を保持する。

## B2B表示用フィールド

B2Bでは価格を公開するため、技術料と部品代を分けて表示できる必要がある。

Case単位:

```txt
b2bTitle
b2bSummaryItems
internalLaborTotal
externalLaborTotal
subcontractTotal
partsTotal
total
```

WorkItem単位:

```txt
b2bDisplay.label
b2bDisplay.laborLabel
b2bDisplay.laborPrice
b2bDisplay.showPrice = true
```

PartItem単位:

```txt
b2bDisplay.label
b2bDisplay.partPrice
b2bDisplay.showPrice = true
```

表示例:

```txt
ガラス交換技術料 3,000円
ミネラルクリスタル 2,000円
合計 5,000円
```

## B2C表示用フィールド

B2Cでは価格を公開しない。

Case単位:

```txt
b2cTitle
b2cSummaryItems
publicTags
publicCommentDraft
```

WorkItem単位:

```txt
b2cDisplay.label
b2cDisplay.publicTag
b2cDisplay.showPrice = false
```

PartItem単位:

```txt
b2cDisplay.label
b2cDisplay.showPrice = false
```

表示例:

```txt
ガラス交換
オーバーホール
リューズ折れ込み巻芯除去
```

B2C用の公開タグは、057の候補をもとに後続タスクで最終定義する。

## 公開可否・レビュー状態

除外理由の候補型:

```ts
type FmpPublicCaseExclusionReason = {
  code:
    | "unreviewed_work_name"
    | "not_public"
    | "moved_to_internal"
    | "moved_to_external"
    | "unmatched_rule"
    | "ambiguous_part_relation"
    | "missing_display_name"
    | "personal_or_internal_info_risk"
    | "needs_photo_review"
    | "manual_review_required";
  message: string;
  source?: string;
};
```

Case単位の公開可否:

- `candidate`: 1件以上の公開候補WorkItemがある
- `needs_review`: 候補はあるが、手動確認が必要な明細を含む
- `excluded`: 候補WorkItemがない、または全明細が対象外

WorkItem単位の公開可否:

- `publish_candidate`: 掲載候補
- `exclude_unreviewed`: 未レビューのため掲載しない
- `exclude_not_public`: 掲載対象外
- `needs_final_review`: 掲載候補だが最終確認が必要
- `unmatched`: ルール未一致

重要:

- 未レビュー221種類は、内容がそれらしくても掲載しない。
- 外装の未確認420種類は、今回の初期候補には入れない。
- 表示名未確定や対象部品・処置が曖昧な外装明細は、候補ではなくレビュー対象として残す。

## 正規化ルール

061で確定した突合用正規化を使う。

```ts
function normalizeRepairWorkNameForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\x00-\x1F]+/g, "")
    .trim();
}
```

方針:

- 正規化は突合用キーだけに使う。
- 元原文は `sourceText` として保持する。
- 制御文字、改行、タブ、垂直タブは突合キーから除去する。
- 全角/半角の強い正規化や意味変換は、今回の初期候補生成では行わない。
- CSV / Excel本体は変更しない。

## 写真の扱い

写真は必須にしない。

初期方針:

```txt
CSVテキストデータだけで公開候補を生成
↓
候補一覧で公開優先度を確認
↓
必要な案件だけ写真を後から紐づけ
```

中間データでは以下を持つ。

```ts
photos: {
  hasPhoto: boolean;
  photoRefs: string[];
  photoReviewStatus: "not_checked" | "not_available" | "available" | "linked";
}
```

CSV / Excelに写真を埋め込まない。写真は将来、別フォルダまたはストレージのファイル名・URLとして紐づける。

## PublicCase系テーブルへの将来接続

中間データは、将来のPublicCase系テーブルへ変換しやすいよう、以下の境界を保つ。

想定変換:

```txt
FmpPublicCaseCandidate
↓
PublicCaseDraft / PublicCaseImportCandidate
↓
PublicCase
↓
PublicCaseWorkItem
↓
PublicCasePartItem
↓
PublicCasePhoto
```

将来接続時に必要な考え方:

- FMP由来の `sourceRepairId` を保持する。
- 取り込み済み判定用に `source = "fmp"` と `sourceRepairId` の組み合わせを一意キー候補にする。
- 取り込み時点の表示名、価格、公開可否はスナップショット化する。
- ルール変更後に過去公開事例の表示が勝手に変わらないようにする。
- B2B / B2Cは同じ候補から生成できるが、公開先・価格表示・コメントは別管理にする。

今回の設計ではDBモデルを作らない。PublicCase系DBモデルはTask 064で検討する。

## 通常Repairへ直接流し込まない理由

FMP過去案件を通常Repairへ直接流し込まない理由:

- 通常Repairは現在の業務運用・入力UI・ステータス管理・顧客対応を前提にしている。
- FMP過去データは列構造、作業欄、部品欄、価格欄の意味が完全には一致しない。
- FMPでは作業欄と部品欄の使われ方が混在しており、自動で現在のRepair構造へ分解すると誤変換リスクが高い。
- 公開事例候補に必要な情報は、通常Repairの全業務情報より少ない。
- FMP過去データには公開してはいけない情報が混ざる可能性があり、通常Repairへ入れる前に公開用の安全な中間層で削る必要がある。
- FMP過去案件は履歴資料であり、現在進行中の修理ステータスや通知、請求、保証書、LINE連携とは別物。
- 今後のWEB新規案件の投稿機能は、通常Repairから生成してよいが、FMP初期公開候補生成とは入力品質と前提が違う。

したがって、まずはFMP専用の公開候補中間データを作り、必要なものだけPublicCase系へ変換する。

## 次タスク案

- Task 063: 中間データJSON/CSV生成スクリプト設計
- Task 064: PublicCase系DBモデル設計
- Task 065: 公開候補一覧UI設計
