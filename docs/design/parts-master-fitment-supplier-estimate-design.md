# PartsMaster 適合・仕入先・見積入力 設計方針

## 位置づけ

2026-09-20時点のPartsMaster（実部品・在庫マスタ）再設計方針。

このドキュメントは設計確定メモであり、schema / migration / code変更の承認ではない。
既存docsと矛盾する場合、本ドキュメントの2026-09-20方針をPartsMaster周辺の最新方針として扱う。

## 1. マスタ責務

- `PartCategoryMaster` / `PartNameMaster`: 表記揺れ防止、共通分類、ドリルダウン用。
- `PartsMaster`: 実際の部品そのものの同一性を表す。
- `PartSupplierOffer`（仮称）: そのPartsMasterをどこから、いくらで、どの納期で買えるかを表す。
- Compatibility: PartsMasterとCaliber / WatchReferenceの適合関係。
- `RepairLineItem`: 見積時価格、実使用結果、実際に選んだSupplierOfferの履歴を残す。

## 2. 案件入力フロー

```text
内装 / 外装
↓
部品カテゴリー
↓
標準部品名
↓
既存PartsMaster候補
↓
該当あり → 選択
該当なし → 新しい部品を作成
```

カテゴリーと標準部品名は、表記揺れ防止とメーカーごとの呼称差を吸収する共通軸。
クロノグラフや特殊機構など1対1対応しないものは無理に共通名へ統合しない。

## 3. 見積時完結型のPartsMaster入力

新しい部品を作成する場合は、案件明細直下の**展開パネル**で入力する。
部品マスタ画面へ移動して後日補完する運用を基本にしない。

見積時にその部品について最も情報が集まるため、可能な限りその場で以下を保存する。

- 部品Ref / 社外メーカーRef
- grade（純正 / 社外 / FIT / 中古等）
- 社外メーカー
- 購入先候補
- 購入先商品番号 / URL
- 仕入価格 / 販売価格 / 納期
- 素材 / サイズ / 色 / 仕様
- 純正との違い
- 写真
- 他Cal共通情報
- Ref / ケースRefへの適合候補
- メーカー公式名 / 検索alias
- 注意事項 / メモ

案件側に既にあるBrand / Ref / ケースRef / Cal / Base Cal / カテゴリ / 標準部品名は再入力させず再利用する。
Web検索等から取得できる情報も候補入力し、ユーザーは確認・修正を中心にする。

## 4. PartsMasterと購入先

購入先が違うだけで常に別PartsMasterにはしない。

実物として同一品と確認できる場合:

```text
PartsMaster 1件
├─ SupplierOffer: 国内材料屋 / 2,500円 / 短納期
└─ SupplierOffer: Cousins / 1,200円 / 長納期
```

同一品か不明な社外品は、保守的に別PartsMasterとして登録する。
後から同一と確認できれば統合し、違うと判明すれば分離する。

価格と納期はPartsMaster本体ではなくSupplierOffer側の販売条件として持つ方向とする。

## 5. Refの意味を分離する

以下を混同しない。

```text
1. 商品自身のRef
2. 純正部品Ref等とのクロスリファレンス
3. 時計Ref / ケースRefへの適合
```

社外品では、製造元Refがない、販売店独自番号のみ、純正Refのみ記載、同じ純正Refを複数社外品が利用、というケースがある。
したがってpartRef一致だけで同一PartsMasterへ自動統合しない。

## 6. 適合は多対多

内装:

```text
PartCaliberCompatibility
PartsMaster ↔ Caliber
```

外装:

```text
PartWatchReferenceCompatibility
PartsMaster ↔ WatchReference
```

1部品が複数Cal / 複数ケースRefへ適合できる。
`CaliberFamily` / Base Cal / `INTERCHANGE`関係は候補検索を広げる材料には使えるが、それだけでVERIFIEDへ自動展開しない。

## 7. 適合の信頼状態

```text
CANDIDATE = 外部情報・推定による候補
VERIFIED  = 実際に使用して適合確認済み
REJECTED  = 実際に試して使用不可確認済み
```

Cousins、メーカー資料、Web、AIの情報はCANDIDATEとして扱う。
VERIFIEDにできる最終根拠は実使用確認。
REJECTEDも削除せず、同じ誤候補の再提示防止に使う。

## 8. 要加工

適合状態とは別に要加工情報を持つ。

```text
requiresModification = true / false
modificationNote = 例「取り付け時にケースのタップ加工が必要」
```

UIでは「要加工」チェック時のみ詳細テキスト欄を表示する。
表示は「適合確認済み（要加工）」等とする。

## 9. 実使用履歴

`RepairLineItem`から以下を追えるようにする。

- どのPartsMasterを使ったか
- どのSupplierOfferの商品を実際に使ったか
- どのRepair / Watch / Cal / Refで使ったか
- 適合OK / NG
- 要加工の有無と内容

同じRefでも「Cousins品はNG、国内材料屋品はOK」のような実績を分離して蓄積できる構造にする。

## 10. 価格・納期・履歴

SupplierOffer側の候補field:

```text
supplierId
supplierPartNo
url
currentPrice
leadTime
availability
lastCheckedAt
note
active
```

過去見積は現在価格を参照し続けず、`RepairLineItem`へ見積時価格をスナップショット保存する。
販売条件は上書きだけでなく、無効化・履歴確認できる構造を検討する。

## 11. 重複判定

純正・社外を問わず、既存候補を提示しても自動統合はしない。
同一Cal + 同一partRef + 同一gradeでも、実物が異なる可能性がある。

新規登録時は、既存候補があればユーザーが以下を選ぶ。

```text
既存を使う
別部品として登録
```

純正を特別に優先するUIにはしない。

## 12. 統合・分離

統合・分離は**部品マスタ管理画面だけ**に置き、案件画面にはボタンを出さない。

統合:

- 正本PartsMasterを1件選ぶ。
- SupplierOffer、適合、写真、履歴等を引き継ぐ。
- 元レコードは削除せずMERGED相当で追跡可能にする。

分離:

- 特定SupplierOfferを新しいPartsMasterへ移す。
- SupplierOfferまで記録された過去RepairLineItemは履歴を追って振り分ける。
- 購入元不明の過去実績は自動で決めつけず要確認にする。

## 13. 在庫分離時の残課題

ロット管理は行わない。
そのため後からPartsMasterを分離する際、現在庫が複数購入先由来で現物判別できない場合は自動振り分けできない。

推奨:

- 分離UIで「新PartsMasterへ移す現在庫数」を人が指定する。
- 判断できない在庫は勝手に移さない。
- 購入履歴だけを根拠に現物を推測して自動移動しない。

## 14. Watch Ref / ケースRef

WatchはRefとケースRefを、同じ`WatchReference`種別を参照する2フィールドとして扱う方向。
UIラベルのみ「Ref」「ケースRef」と分ける。

部品検索では2つを一つの検索語に結合せず、別検索として実行して結果を重複排除する。

## 15. Cal / Base Cal / Caliber relation

- Cal = その時計の公式Cal。
- Base Cal = 系譜・ベースムーブメント。
- Cal / Base Calともメーカー選択 → そのメーカーのCal選択、の必須ドリルダウン。
- `CaliberRelation`は `BASE` / `EVOLUTION` / `INTERCHANGE` 等を意味別に分ける。
- `CaliberFamily`は系列・技術資料共有等に使うが、部品互換を自動保証しない。

旧docsの「Cal = 実搭載Cal」という表現は、本設計の「公式Cal」定義と矛盾する範囲では本設計を優先する。

## 16. 部品写真と撮影UI

PartsMasterは複数写真を持てる前提にする。
用途は商品全体、刻印、寸法、歯先、純正比較、販売店差の記録等。

部品撮影は、3眼顕微鏡カメラのHDMI出力を既存4Kキャプチャー基盤へ入れ、PartsMaster展開パネルから撮影・保存する方向。

アプリ側では用途を以下のように分ける。

```text
時計撮影ソース → S5M2X
部品撮影ソース → 顕微鏡カメラ
```

当面はHDMI 2入力1出力切替器を手元リモコンで切替。
将来2入力キャプチャーへ変更してもUIの用途概念を維持できる設計にする。

## 17. 実装時の注意

- PartsMasterへCal / Base Cal / Supplierを単一正本として直持ちする設計へ戻さない。
- 旧PartsMasterの`caliberId` / `baseCaliberId` / `movementMakerId` / `baseMakerId`等は移行計画なしに即削除しない。
- 最終的なsource of truthを旧列と新relationで二重化し続けない。
- schema / migrationは別Taskで独立レビューする。
- 現在のInquiry Phase 2 production rollout完了前にPhase 3実装へ進まない。
- 本docs更新ではcode / schema / migration / production DBを変更しない。

## 18. 未確定事項

- PricingRuleで公式CalとBase Calのどちらを優先するか。
- CaliberFamilyで「2500」のような汎用Calレコードを併存させるか、Familyだけにするか。
- Compatibility / SupplierOffer等の最終model名・field名。

これらは実装Task前に個別に確定する。
