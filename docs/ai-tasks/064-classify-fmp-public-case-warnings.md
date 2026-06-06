# AI Task 064: FMP公開候補中間データの警告分類

## 目的

Task 063で生成したFMP公開事例候補中間データの警告472件を分類し、公開事例取り込み前に対応が必要なものと、ログ扱いでよいものを分ける。

今回は生成済みJSONの読み取り分析のみ。CSV / Excel / JSON本体、DB、schema、既存マスタ、通常Repairは変更しない。

## 前提

- `public-case-candidates.json` は公開候補Case 2,924件を含む。
- 警告は公開候補生成を止めるエラーではなく、後続レビューのための情報。
- 061の正規化後件数は確定扱い。
- 公開候補件数の整合性は063で確認済み。

## 参照ファイル

- `docs/ai-tasks/063-generate-fmp-public-case-candidates.md`
- `scripts/generate-fmp-public-case-candidates.ts`
- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/public-case-candidates.csv`

## 警告総数

| 項目 | 件数 |
| --- | ---: |
| 公開候補Case件数 | 2,924 |
| 警告総数 | 472 |

## 警告分類別集計

| 警告種類 | 件数 | 重要度 | 意味 |
| --- | ---: | --- | --- |
| `part_without_publishable_work` | 466 | review | 部品欄はあるが、同slotに公開候補WorkItemがない |
| `source_text_normalized` | 6 | info | CSV原文に制御文字などがあり、突合用キーで正規化した |

## critical 警告

| 件数 | 内容 |
| ---: | --- |
| 0 | 取り込み前に必ず停止すべき警告は今回なし |

現時点では、生成済み中間データをPublicCase設計の検討材料として使うことを止める問題は見つからなかった。

ただし、実際に公開する前には `review` 警告の扱いを確認する。

## review 警告

| 警告種類 | 件数 | 対応 |
| --- | ---: | --- |
| `part_without_publishable_work` | 466 | 公開前に確認推奨 |

内訳:

| 区分 | 件数 |
| --- | ---: |
| external | 369 |
| internal | 97 |

slot別:

| slot | 件数 |
| --- | ---: |
| external-1 | 296 |
| internal-2 | 65 |
| external-2 | 61 |
| internal-1 | 17 |
| internal-3 | 15 |
| external-3 | 12 |

対応するWorkItem状態別:

| 状態 | 件数 |
| --- | ---: |
| 同slotにWorkItemなし | 409 |
| 外装ルール未一致・未レビュー | 45 |
| 内装未レビュー | 7 |
| 外装から内装へ移動扱い | 3 |
| 外装掲載対象外 | 1 |
| 内装掲載対象外 | 1 |

## info 警告

| 警告種類 | 件数 | 対応 |
| --- | ---: | --- |
| `source_text_normalized` | 6 | ログ扱いでよい |

内訳:

| 修理ID | 対象 | CSV側原文 | 正規化後 |
| --- | --- | --- | --- |
| 13259 | internal-1 | `電池交換\x0B` | `電池交換` |
| 13459 | internal-1 | `半OH\x0B` | `半OH` |
| 14247 | internal-2 | `穴締め\x0B振りベラ修正` | `穴締め振りベラ修正` |
| 14263 | internal-3 | `ヒゲ修正　穴石交換\x0B` | `ヒゲ修正　穴石交換` |
| 14841 | external-1 | `インデックス取付\x0B\x0B` | `インデックス取付` |
| 15152 | internal-1 | `電池交換\x0B` | `電池交換` |

このうち、13259、13459、14841、15152は正規化により公開候補として期待件数に反映済み。14247、14263は正規化後も公開候補ルールに一致しないため、候補件数には影響しない。

## 代表例

### part_without_publishable_work

| 修理ID | ブランド | モデル | REF | 警告 | 作業欄 | 部品欄 | 部品価格 | 対応WorkItem状態 |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| 12029 | ROLEX | サブマリーナ | 16610 | external-1 | 交換技術料 | ベゼルバネ | 2000 | 外装ルール未一致・未レビュー |
| 12029 | ROLEX | サブマリーナ | 16610 | external-2 |  | ベゼルクリックバネ | 2000 | 同slotにWorkItemなし |
| 12050 | OMEGA | コンステレーション | 1502.30　368.1201 | internal-2 |  | 3番車 | 2000 | 同slotにWorkItemなし |
| 12051 | ROLEX | エアキング | 14000 | internal-2 |  | 自動巻き受けねじ | 5000 | 同slotにWorkItemなし |
| 12052 | ROLEX | デイトジャスト | 16233 | internal-2 | 各パーツサビ取り | 巻芯（社外品） | 1200 | 内装未レビュー |
| 12055 | ROLEX | デイトジャスト | 116231 | internal-1 | 交換工賃 | ローター芯（社外パーツ） | 5000 | 内装未レビュー |
| 12059 | ROLEX | デイトジャスト | 79174 | external-1 |  | リューズ | 30000 | 同slotにWorkItemなし |
| 12088 | Baume&Mercier |  | 1727 | external-1 |  | ガラス | 2000 | 同slotにWorkItemなし |

### source_text_normalized

| 修理ID | ブランド | モデル | REF | 対象 | 原文 | 正規化後 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 13259 | SEIKO | パーペチュアル | 8F35-0020 | internal-1 | `電池交換\x0B` | `電池交換` | 公開候補 |
| 13459 | ROLEX | デイトジャスト | 16234 | internal-1 | `半OH\x0B` | `半OH` | 公開候補 |
| 14247 | OWARITOKEI | 掛時計 |  | internal-2 | `穴締め\x0B振りベラ修正` | `穴締め振りベラ修正` | ルール未一致 |
| 14263 | LONGINES | クロノグラフ | 5971 1 | internal-3 | `ヒゲ修正　穴石交換\x0B` | `ヒゲ修正　穴石交換` | ルール未一致 |
| 14841 | SKAGEN |  | SKW2310 | external-1 | `インデックス取付\x0B\x0B` | `インデックス取付` | 公開候補 |
| 15152 | OMEGA | シーマスター |  | internal-1 | `電池交換\x0B` | `電池交換` | 公開候補 |

## 部品欄あり・対応WorkItemなしケースの分析

`part_without_publishable_work` は466件あり、警告全体の大半を占める。

主なパターン:

1. 同slotに作業欄がなく、部品欄だけがある
2. 同slotに作業欄はあるが、その作業が未レビューまたはルール未一致
3. 同slotの作業は掲載対象外、または内装/外装移動扱い

特に多いのは `同slotにWorkItemなし` の409件。

これはFMPの部品欄が、作業欄とslot単位で必ず対応しているとは限らないために発生している。たとえば `external-1` の部品欄にリューズやガラスがあっても、外装修理内容1が空欄の場合、現スクリプトでは公開候補WorkItemへ自動紐づけしない。

公開事例としての影響:

- B2Cでは価格非表示のため、多くは致命的ではない。
- B2Bでは部品代を表示するため、WorkItemとの対応が曖昧な部品を自動表示すると誤表示リスクがある。
- 部品欄だけで公開候補を増やすと、未レビュー作業を実質的に掲載してしまう可能性がある。

したがって、今回の段階では `review` とし、自動取り込み停止ではなく、公開前レビューまたは後続の部品紐づけルール設計で扱う。

## 対応方針

### 取り込み前に止めるもの

現時点ではなし。

ただし、PublicCaseへ実投入する段階では、以下のどちらかを選ぶ。

- `part_without_publishable_work` の部品をB2B表示から除外する
- 公開候補一覧UIでレビュー済みにしたものだけ部品代表示に含める

### 公開前に確認するもの

- `part_without_publishable_work` 466件
- 特に高額部品やB2B表示に使う部品
- 同slotのWorkItemが未レビュー・ルール未一致のもの

### ログ扱いでよいもの

- `source_text_normalized` 6件

正規化後の候補件数は061と一致済みで、元原文も保持されているため、取り込み前修正は不要。

## 実行確認

```powershell
npx tsx scripts/analyze-fmp-public-case-warnings.ts
npx tsc --noEmit --pretty false --incremental false
```

結果:

- `npx tsx scripts/analyze-fmp-public-case-warnings.ts`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功

## 次タスク案

- Task 065: `part_without_publishable_work` の部品表示方針設計
- Task 066: 生成JSONのレビュー用プレビュー設計
- Task 067: PublicCase系DBモデル設計
