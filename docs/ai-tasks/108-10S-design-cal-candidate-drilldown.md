# Task 108-10S: Cal / Base Cal のメーカー選択に応じたCal候補ドリルダウン設計調査

## 目的

RepairEntryForm の Cal / Base Cal 入力を、メーカー選択に応じて Cal 候補を絞り込むドリルダウン方式にするため、現行 schema / UI / 保存処理 / 候補取得の状態を調査した。

このTaskでは実装変更は行わない。

目標UI:

```txt
Cal
  メーカー   ROLEX
  Cal        3135 / 3000 / 1570 / ...

Base Cal
  メーカー   ETA
  Cal        2892.A2 / 2824-2 / 7750 / ...
```

期待挙動:

```txt
Cal > メーカーで ROLEX を選ぶ
→ Cal候補は ROLEX のCalだけ表示

Base Cal > メーカーで ETA を選ぶ
→ Base Cal候補は ETA のCalだけ表示
```

## 前提commit

作業前に確認した直近commit:

```txt
8137a7f feat: display cal and base cal as grouped fields
0673bc2 docs: design cal and base cal display
4882e9d feat: filter target parts by confirmed work category mapping
0a30b83 feat: seed movement part and additional repair actions
f244934 docs: investigate action part and caliber gaps
3c46471 docs: document master responsibility overview
33b7e8a docs: design target part filtering by work category
d5b856a feat: improve repair entry layout and structured work persistence
```

108-10R は commit 済みで、RepairEntryForm 上の表示は以下の2ブロックへ整理済み。

```txt
Cal
  メーカー
  Cal

Base Cal
  メーカー
  Cal
```

## 調査対象ファイル

確認したファイル:

```txt
prisma/schema.prisma
src/components/repairs/RepairEntryForm.tsx
src/actions/master-actions.ts
src/actions/repair-actions.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
src/lib/master-normalize.ts
docs/ai-tasks/108-10Q-design-cal-base-cal-display.md
docs/ai-tasks/108-10R-implement-cal-base-cal-display.md
```

存在しなかったファイル:

```txt
src/lib/parts-matching.ts
```

現状の部品候補取得は `src/actions/master-actions.ts` の `getPartsMatched()` と `src/lib/part-search.ts` 側の検索補助で扱っている。

## Caliber（Calマスタ）の構造

`Caliber` は共通の Cal マスタとして存在する。

```prisma
model Caliber {
  id                  Int     @id @default(autoincrement())
  brandId             Int?
  name                String
  nameEn              String?
  nameJp              String?
  movementType        String?
  standardWorkMinutes Int     @default(60)

  brand Brand? @relation(fields: [brandId], references: [id])
}
```

重要な点:

| 項目 | 現状 |
| --- | --- |
| メーカーID | `brandId` |
| メーカーrelation | `Brand` |
| Cal / Base Cal区分 | `Caliber` 側には持たない |
| 実Cal / Base Calの区別 | `Repair.movementCaliberId` / `Repair.baseMovementCaliberId` で区別 |
| メーカー別絞り込み | `Caliber.brandId` で可能 |

したがって、短期的には `Brand` 兼用のまま、メーカーとして選ばれた `Brand.id` を `Caliber.brandId` に当てて候補を絞り込める。

例:

```txt
movementMakerId = ROLEXのBrand.id
→ getCalibers(movementMakerId)
→ ROLEXに紐づくCaliberのみ候補表示
```

## MovementMaker（ムーブメント製造元）の現状

専用の `MovementMaker` model は存在しない。

現行 schema では、Repair のメーカー系fieldは `Brand` を参照している。

| field | 型 | relation | 意味 |
| --- | --- | --- | --- |
| `movementMakerId` | `Int?` | `Brand` | Calメーカー |
| `baseMovementMakerId` | `Int?` | `Brand` | Base Calメーカー |
| `movementCaliberId` | `Int?` | `Caliber` | 実搭載Cal |
| `baseMovementCaliberId` | `Int?` | `Caliber` | 元になったBase Cal |

保存先としては、現在のUI方針と合っている。

```txt
Cal
  メーカー → Repair.movementMakerId
  Cal      → Repair.movementCaliberId

Base Cal
  メーカー → Repair.baseMovementMakerId
  Cal      → Repair.baseMovementCaliberId
```

懸念:

```txt
Brand は時計ブランドとムーブメント製造元を兼用している。
そのため、ROLEX / OMEGA / ETA / Valjoux / Lemania などが同じ候補リストに混在する。
短期的には流用できるが、候補リストが増えるとメーカー選択がノイズを含みやすい。
```

## 候補取得の現状

RepairEntryForm の初回ロードでは以下を取得している。

```ts
getBrands()
getCalibers()
```

現状の候補:

| UI | state | 候補 |
| --- | --- | --- |
| Cal > メーカー | `movementMaker` | `brandOpts` |
| Cal > Cal | `movementCaliber` | `masterCalOpts` |
| Base Cal > メーカー | `baseMovementMaker` | `brandOpts` |
| Base Cal > Cal | `baseMovementCaliber` | `masterCalOpts` |

`masterCalOpts` は `getCalibers()` を引数なしで呼んでおり、全 Caliber が入る。

```ts
getCalibers().then(d =>
  setMasterCalOpts(d.map((c: any) => ({ label: c.name, value: c.name, id: c.id })))
);
```

そのため現状では、メーカーを ROLEX にしても、Cal候補には ETA / OMEGA / ROLEX など全件が表示される。

一方、`src/actions/master-actions.ts` の `getCalibers()` 自体は `brandId` 引数に対応している。

```ts
export async function getCalibers(brandId?: number) {
  return await prisma.caliber.findMany({
    where: brandId ? { brandId } : {},
    orderBy: { name: 'asc' }
  });
}
```

つまり、候補取得関数側にはメーカー別絞り込みの入口がすでにある。

## AdvancedComboboxの仕様

Cal / Base Cal は既存の `AdvancedCombobox` を使っている。

確認した仕様:

| 項目 | 現状 |
| --- | --- |
| `options` 差し替え | 可能 |
| 入力値 | `value` と `onChange` の文字列state |
| 候補検索 | `options` を client-side filter |
| 自由入力 | 可能。入力中に `onChange` が呼ばれる |
| `disabled` | 対応あり |
| `onUpsert` | ブランド/メーカー側では使用。Cal側は現状未使用 |
| 候補外値のクリア | 呼び出し側のhandlerで実装可能 |

したがって、次Taskで以下のような実装が可能。

```txt
メーカー変更
→ 対応するCal候補stateを再計算または再取得
→ AdvancedCombobox の options に渡す
→ 現在のCalが候補外ならクリア
```

## 保存処理への影響

保存payloadは現在も以下を送っている。

```txt
watch.movementMaker
watch.movementCaliber
watch.baseMovementMaker
watch.baseMovementCaliber
```

新規作成API / 更新APIでは、以下のように既存fieldへ保存する。

```txt
watch.movementMaker
→ findOrCreateBrand()
→ Repair.movementMakerId

watch.movementCaliber
→ findOrCreateCaliber(..., movementMakerId)
→ Repair.movementCaliberId

watch.baseMovementMaker
→ findOrCreateBrand()
→ Repair.baseMovementMakerId

watch.baseMovementCaliber
→ findOrCreateCaliber(..., baseMovementMakerId)
→ Repair.baseMovementCaliberId
```

このため、Cal候補ドリルダウンの短期実装では保存schemaを変更する必要はない。

ただし、`src/lib/master-normalize.ts` の `findOrCreateCaliber()` は、現状では Cal 名の正規化一致を全メーカー横断で探す。

```txt
同名Calが別メーカーに存在する場合
→ brandId違いでも既存Caliberを返す可能性がある
```

この点は、自由入力Calを正式にマスタ登録する前に見直す必要がある。

## Cal / Base Cal ドリルダウン短期案

### 案A: メーカー変更時に `getCalibers(brandId)` で取得する

メーカー選択時に、そのメーカーIDで Caliber を取得する。

```txt
Cal > メーカー変更
→ brandOpts から Brand.id を取得
→ getCalibers(Brand.id)
→ movementCaliberOptions にセット

Base Cal > メーカー変更
→ brandOpts から Brand.id を取得
→ getCalibers(Brand.id)
→ baseMovementCaliberOptions にセット
```

メリット:

```txt
現行actionをそのまま使える
Caliber.brandId をDB側で絞れる
全CalリストをUI側で持ち続けなくてよい
```

注意:

```txt
メーカー変更のたびに server action 呼び出しが発生する。
空メーカー時の候補表示仕様を決める必要がある。
```

### 案B: 初回取得の `masterCalOpts` に `brandId` を含めてclient-side filterする

`getCalibers()` の戻り値には `brandId` が含まれるため、RepairEntryForm側のmapで `brandId` を残す。

```ts
{ label: c.name, value: c.name, id: c.id, brandId: c.brandId }
```

そのうえで、メーカー選択に応じて `masterCalOpts.filter(c => c.brandId === makerId)` する。

メリット:

```txt
メーカー変更時に追加通信しない
既存の全件取得に少し情報を足すだけで実装できる
```

注意:

```txt
Caliber件数が増えると初回ロードが重くなる。
Brand未紐づけCaliberをどう扱うか決める必要がある。
```

### 短期推奨

短期実装では案Bを推奨する。

理由:

```txt
RepairEntryFormはすでに masterCalOpts を全件保持している。
次Taskの変更範囲をUI内の候補計算に閉じやすい。
候補外クリアも同期的に実装しやすい。
```

ただし、Caliber件数が大きくなった段階では案Aへ切り替える。

## 候補外Calのクリア仕様案

メーカー変更時は、現在選択中のCalが新メーカーの候補に含まれるか確認する。

推奨仕様:

```txt
メーカー変更時、
選択中Calが空
→ 何もしない

選択中Calが新メーカー候補内にある
→ 保持

選択中Calが新メーカー候補外
→ Calをクリア
```

Base Cal も同じ仕様にする。

補足:

```txt
自由入力中のCalを勝手に消すと入力体験が悪い。
クリアは「メーカーselectの確定変更時」に限定するのが安全。
```

候補0件時:

```txt
全件fallbackは禁止。
メーカーに紐づくCal候補がない場合は候補なしとして扱う。
必要なら小さく「このメーカーのCal候補は未登録です」と表示する。
```

## 新規作成時の補助入力案

### 案1: 時計ブランドを Cal > メーカーへ初期提案する

時計ブランドが ROLEX の場合:

```txt
Cal > メーカー: ROLEX
```

ただし、自動確定ではなく、候補として選びやすくする程度が安全。

理由:

```txt
時計ブランドと実Calメーカーが一致しない時計がある。
自動確定すると OMEGA / ETA などで誤入力になりやすい。
```

### 案2: Base Cal > メーカーはよく使う候補を上位表示する

Base Cal は ETA / Valjoux / Lemania / Frederic Piguet などが候補になりやすい。

短期的には専用modelがないため、Brand候補の中で以下を上位表示する案がある。

```txt
ETA
Valjoux
Lemania
Frederic Piguet
Sellita
Seiko
Miyota
```

ただし、このTaskでは候補追加やseed変更は行わない。

### 案3: Ref選択時の `Watch.caliber` fallbackをCalブロックへ移す

現在は Ref 選択で `watch.caliber` が補完される。

将来的には以下も検討できる。

```txt
Refに紐づくCaliberがあり、Calブロックが空
→ Cal > Cal に提案
→ Cal > メーカーは Caliber.brandId から提案
```

ただし、`Watch.caliberId` と `Repair.movementCaliberId` の同期・移行方針が絡むため別Taskにする。

## 自由入力Calとマスタ登録の将来案

現状の AdvancedCombobox は自由入力でき、保存APIでは自由入力Calを `findOrCreateCaliber()` で登録できる。

将来案:

```txt
Cal > メーカー: ROLEX
Cal > Cal: 3230

候補にない
→ 「Calマスタに登録しますか？」を表示
→ 登録する場合のみ Caliber に ROLEX / 3230 を作成
```

ただし、現行の `findOrCreateCaliber()` は同名Calをメーカー横断で拾うため、厳密なマスタ登録にはまだ弱い。

先に検討すべきこと:

```txt
Caliber の同名別メーカーを許すか
Caliber の検索条件を name + brandId に寄せるか
brandId null の既存Caliberをどう扱うか
自由入力登録を review 扱いにするか
```

現時点では、自由入力Calを完全な正式マスタ登録とみなさず、段階的に整理する。

## 中期案: MovementMaker専用model

短期的には `Brand` 兼用で進められる。

ただし、中期的には `MovementMaker` 専用modelを検討する余地がある。

理由:

```txt
Brand は時計ブランドとムーブメント製造元が混在する。
ETA / Valjoux / Lemania / Sellita などは時計ブランドとは別軸で管理したい。
Base Cal のメーカー候補は時計ブランド候補と分けた方が入力しやすい。
Caliber.brandId という名前が、製造元IDとしては意味が曖昧。
```

中期案:

```txt
MovementMaker
  id
  name
  displayName
  aliases
  isActive

Caliber
  movementMakerId
  name
  displayName
```

ただし、これは schema変更を伴うため、このTaskおよび次の短期実装Taskでは行わない。

## 変更してはいけないもの

このTask、および次の短期実装Taskでは、明示された対象以外を変更しない。

変更禁止:

```txt
schema
migration
seed
DB構造
保存処理
RepairEntryFormの保存payload
PartsMaster検索
getPartsMatched
PartsSearchPanel
PricingRule
帳票
PDF
LINE
共有ページ
PublicCase
108-10Pの対象部品候補絞り込み
RepairLineItem保存仕様
EstimateItem表示仕様
```

Cal / Base Cal のドリルダウンは、既存表示・既存保存・既存検索を壊さない形で段階導入する。

## 実装時のリスク

### 1. Brand兼用による候補ノイズ

メーカー候補が時計ブランドとムーブメント製造元を兼ねているため、候補が増えるほど選びにくくなる。

### 2. Caliber.brandId が未設定の既存データ

`brandId = null` の Caliber がある場合、メーカー選択後の候補から消える。

対応案:

```txt
短期: 候補なしとして扱う
中期: brandId未設定Caliberの整理Taskを作る
```

### 3. findOrCreateCaliber がメーカー横断で同名一致する

現行 `findOrCreateCaliber()` は正規化名で全Caliberから一致検索する。

同名Calが複数メーカーにある場合、意図しない既存Caliberを返す可能性がある。

### 4. メーカー変更時のCalクリアで入力が消える

候補外クリアは必要だが、ユーザーが自由入力中の値を不用意に消すとストレスが大きい。

実装時はメーカーの確定変更時にだけクリアする。

### 5. Watch.caliber と Repair.movementCaliber の二重構造

現状は互換維持のため、`Watch.caliberId` と `Repair.movementCaliberId` が共存している。

次のドリルダウン実装では保存構造を変えず、同期・移行は別Taskにする。

### 6. PricingRuleのCal優先順位

現行 RepairEntryForm では PricingRule 取得時に以下の順で `caliberId` を選ぶ。

```txt
movementCaliber
baseMovementCaliber
watch.caliber
```

今回のドリルダウン設計ではこの優先順位は変更しない。

PricingRuleの実Cal / Base Cal対応は別Taskで扱う。

## 次Task候補

```txt
Task 108-10T:
RepairEntryFormで、Cal / Base Cal のメーカー選択に応じてCal候補を絞り込む。
schema / 保存処理 / PartsMaster検索 / PricingRule は変更しない。
```

```txt
Task 108-10U:
findOrCreateCaliber の同名別メーカー対応を調査し、自由入力Calのマスタ登録方針を整理する。
```

```txt
Task 108-10V:
Brand兼用のMovementMaker候補が運用上つらくなった場合、MovementMaker専用modelの必要性を再評価する。
```

## 未確認点

```txt
ローカルDB上で brandId null の Caliber がどの程度あるか
ROLEX / ETA / OMEGA など主要メーカーに十分な Caliber が紐づいているか
同名Calが複数メーカーで衝突している実データがあるか
```

このTaskではDB読み取り調査は行わず、schema・コード・既存docsの確認に留めた。
