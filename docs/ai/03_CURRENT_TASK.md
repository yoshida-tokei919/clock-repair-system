# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書である。
過去Task履歴は残さず、現在有効な状態だけを書く。

## 現在Task

Phase 2: 内装部品マスタを Cal 別実部品中心へ再設計し、メーカー資料・多言語名称・カテゴリー・解説書連携の要件を確定する。

## 目的

内装部品を、メーカー横断の日本語標準名を先に完成させる方式ではなく、movementCaliber（ムーブメントCal）ごとの実部品として段階的に蓄積できるようにする。

クロノグラフ等、メーカーごとに機構や部品構成が大きく異なる領域では、共通名を推測して無理に統一しない。
メーカー解説書・部品表・展開図を根拠に、部品番号・メーカー原名・日本語名または仮訳・カテゴリーを登録し、UIでは選択中Calに属する部品だけを段階的に絞り込んで表示する。

既存の内装作業マスタ、外装作業マスタ、PricingRuleは原則変更しない。
作業マスタと部品マスタを混同しない。

## 現在地

Phase 1（作業マスタ）は一旦完了。

確認済み:

- internal（内装作業）を構造化入力できる
- external_labor（外装技術料）を構造化入力できる
- internal と external_labor の処置候補は分離されている
- external_labor と part_external（外装部品行）は分離されている
- 外装PricingRuleは保存後、同条件で候補再表示される
- customerType は business / individual のみ
- modelIdあり候補はmodelId=nullより優先される
- 編集画面で保存済み外装LABORの表示は維持される
- part_external はPricingRuleへ学習されない

現行schema確認済み:

- PartsMaster.standardPartNameId は nullable
- PartsMaster は caliberId / baseCaliberId / movementMakerId / partRefs / name / nameEn / nameJp / 在庫 / 価格 / 仕入先 / 写真等を持つ
- PartsMaster.nameJp は現状必須であり、「日本語名不明・英語名のみ」の登録方針と衝突するため変更要否を検討する
- PartNameMaster.nameJa は現状必須
- getInternalPartNameMasters() は現状 movementCaliber で絞り込まず、activeな候補を広く取得している
- RepairLineItem には itemNameSnapshot / estimateDisplayNameSnapshot / b2bDisplayNameSnapshot / b2cDisplayNameSnapshot 等があり、発行時点表示の保持に利用できる

## 内装部品マスタの基本方針

### 1. PartsMasterをCal固有実部品の主軸にする

PartsMaster（実部品・在庫マスタ）は以下を扱う。

- movementMaker / movementCaliber
- baseMovementMaker / baseMovementCaliber
- 部品番号（partRef）
- メーカー原名
- 日本語標準名または日本語仮訳
- カテゴリー
- グレード
- 在庫
- 仕入
- 価格
- 写真
- 発注
- 出典資料

日本語標準名が未確定でも、Cal・部品番号・メーカー原名等が分かれば登録可能にする。
standardPartNameId は必須にしない。

PartNameMaster（標準部品名マスタ）は、メーカー横断で意味が安定している部品名に使う。
クロノグラフ等で1対1対応が成立しない部品を、推測でPartNameMasterへ統合しない。

### 2. 部品名は多言語・段階確定を前提にする

メーカー資料の原語名は必ず保持する。
日本語名は「確定した標準名」と「メーカー原名から作った日本語仮訳」を区別する。

表示名の優先順位:

1. 日本語標準名
2. 日本語仮訳
3. メーカー英語名
4. 最深カテゴリー名 + 「部品」 + 部品番号
5. 部品番号のみ

例:

- 分積算中間車
- Minute counter intermediate wheel の日本語仮訳
- Minute counter intermediate wheel
- 分積算 部品 8042
- 8042

表示名生成ロジックはUI、見積書、納品書、共有表示等で個別実装せず、共通ロジックへ集約する方向で設計する。
発行済み帳票等はRepairLineItem側のsnapshotを保持し、後日のマスタ名称更新で過去表示を意図せず書き換えない。

### 3. メーカー横断の部品名完全統一を前提にしない

クロノグラフをSEIKO / ETA / OMEGAで比較した結果、機構・部品構成・名称がメーカー間で大きく異なり、完全な共通標準名を先に作る方式は採用しない。

分かるものだけ標準名へ紐づける。
分からないものはメーカー原名 + 部品番号で登録し、後から名称や紐付けを更新する。

確定済みのクロノグラフ名称例:

- 秒クロノグラフ車
- 分積算車
- 時積算車
- リセットハンマー
- ハートカム

`クロノグラフ車` は `秒クロノグラフ車` へ統合する方向。
既存 `クラッチレバー` は汎用標準名としては廃止候補。実資料上の Clutch / Clutch ring / Operating lever 等を別部品として扱う。

### 4. メーカー原名からの日本語仮訳ルール

直訳だけでなく、時計修理で自然な用語へ寄せる。ただし英語原名は必ず保持する。

現時点の基本ルール例:

- counting wheel → 積算車
- driving wheel → 駆動車
- intermediate wheel → 中間車
- bridge → 受け
- hammer → リセットハンマー
- operating lever → 作動レバー
- jumper → ジャンパー
- yoke → 原則レバー

`yoke lever` のようにそのまま訳すと不自然な場合は、前半を機能名として解釈し「○○作動レバー」「○○中間レバー」等へ自然化する。
例: Fly-back yoke → 復針レバー、Reversing yoke → 切替レバー。

翻訳ルールは固定辞書として過信せず、解説書の展開図・位置・作用を確認して補正する。

## Cal連動drill-down

UIではDB全体の部品名を一括表示しない。
最初に movementCaliber で候補を絞り、そのCalに登録済みの部品・カテゴリーだけを通常候補として表示する。

基本:

movementCaliber
→ そのCalに存在するカテゴリー
→ 必要なら機能グループ
→ そのCalに存在する部品

例: ETA 7750

- クロノグラフ
  - 秒クロノグラフ
  - 分積算
  - 時積算
  - 発停・クラッチ
  - 作動・制御
  - 復針
  - 受け・保持
  - その他

大量のメーカー固有部品名がDBに存在しても、選択中Calに属さない部品を通常候補へ混在させない。

baseMovementCaliber がある場合の継承/fallback条件は別途明示的に設計する。

### 候補にない部品の実務入力と仮登録

交換部品があるのに、そのCalの部品候補に該当名がない場合でも修理入力を止めない。

実務フロー:

1. movementCaliber を選択する
2. そのCalに存在するカテゴリーをdrill-downで選択する
3. 必要なカテゴリでは機能グループまで選択する
4. 部品名候補にない場合は「部品名を追加」等から手入力する
5. 手入力値をその案件の明細に使用する
6. 同時に、そのCal・カテゴリーに紐づくCal固有部品としてDBへ PROVISIONAL（仮登録）保存する
7. 次回同じCal・同じカテゴリーでは通常候補として再利用できるようにする

仮登録でもdrill-down対象にする。仮登録であることはUI上で小さく表示するが、通常入力の操作性を本登録と大きく分けない。

部品の確認状態は原則として以下の2状態とする。

- PROVISIONAL: 仮登録。修理実務中の手入力や、資料未確認の名称
- VERIFIED: 確認済み。メーカー解説書・部品表・展開図等で正式情報を確認済み

PROVISIONALでも部品検索ワード生成には利用可能とする。ただしメーカー公式名称としては扱わない。

PROVISIONALは他Calへ自動展開しない。同一メーカー、派生Cal、baseMovementCaliberが存在する場合でも、資料または実機で同一部品と確認できるまでは登録元Cal固有の候補として扱う。

後日解説書等を入手し、メーカー原名・部品番号・正式な日本語名等が判明した場合は、既存PROVISIONALとの重複照合を行う。可能なら既存レコードをVERIFIEDへ昇格し、すでに正式部品が存在する場合は統合する。単純に別レコードを追加して重複を残さない。

仮登録からVERIFIEDへの昇格や名称変更が行われても、過去のRepairLineItem等は保存済みsnapshotを優先し、過去案件表示を意図せず書き換えない。

## カテゴリー分類

部品名はメーカー/Cal固有を許容するが、カテゴリーはUIの共通軸として機能ベースで可能な範囲を共通化する。

クロノグラフの基本カテゴリー候補:

- 秒クロノグラフ
- 分積算
- 時積算
- 発停・クラッチ
- 作動・制御
- 復針
- 受け・保持
- その他

新Cal解析時は、メーカー原名・部品表・展開図・組立順・作用説明からAIがカテゴリー候補を付ける。
高確度なものは自動候補、曖昧なものだけヨシダ確認対象にする。

1部品が複数機能にまたがる場合は、UI用の主カテゴリー1つ + 機能タグ複数の方式を候補とする。
厳密なschemaは既存schemaとの整合を確認してから決定する。

## 解説書（Technical Document）

Calごとに対応するメーカー解説書・部品表・展開図を登録し、アプリの修理画面等から「解説書」ボタンで直接閲覧できるようにする。

要件:

- Calから対応解説書を特定できる
- 1つの資料が複数Calを対象にできる
- 1つのCalに複数資料を紐づけられる
- 将来的には部品表ページ / 展開図ページ等の該当ページへ直接開ける余地を残す
- DBをGoogle Drive等の特定保存先へ固定しない
- TechnicalDocumentとCalの多対多関係を候補とする
- PDF本体の保存場所は要検討

### 解説書を保有していないCal

解説書未保有でも修理案件・部品入力を止めない。

当面の実務運用:

- 「解説書未登録」と明示して通常運用を継続する
- 必要になった交換部品だけ、Cal → カテゴリー → 必要なら機能グループまでdrill-downし、部品名を手入力してPROVISIONAL登録する
- 部品番号や既知名称が分かる場合は仮登録に保持する
- 後日資料入手時にメーカー原名・日本語仮訳・カテゴリー・出典を補完し、VERIFIEDへ昇格または正式部品へ統合する

引き続き検討する項目:

- baseMovementCaliberの資料を参照可能にする条件
- メーカー公式以外の信頼できる資料を代替資料として登録可能にするか
- 解説書未登録Calを後から確認できる一覧/フラグを用意するか

## 新Cal追加時の当面の運用

当面はChatGPT/Codexを使用して人間確認付きで蓄積する。

1. 新しいmovementCaliberが案件で初登場
2. メーカー解説書を所定の保存場所へ登録
3. カタリが解説書・部品表・展開図を確認
4. 部品番号、メーカー原名、日本語標準名または仮訳、カテゴリー候補を作成
5. 確信度の低い項目だけヨシダ確認
6. 承認後、CodexがDB/seed等へ追加
7. 次回同Cal案件では登録済み部品を再利用

解説書がない新Calは、先に空のCal部品体系を全件作成しない。実際に必要になった交換部品をPROVISIONALで蓄積し、後日資料入手時に正式化する。

将来的な「アプリ内PDFアップロード→AI解析→DB登録」はOpenAI API等の別従量課金が必要になるため、現段階では実装しない。
実例が十分に蓄積し、費用対効果が見えた時点で再検討する。

## PartNameTerm / 多言語名称の設計前提

多言語・出典別用語を扱える構造は維持する。
ただし従来の「PartNameMaster 1件にだけ紐づく検索用語」という前提は再検討する。
標準名未確定のCal固有PartsMasterにもメーカー原名・多言語表記を保持できる必要がある。

想定情報:

- language
- term
- normalizedTerm
- termType: primary / official / supplier / alias / search / translated 等
- source
- manufacturer
- movementCaliber / family
- sourceDocumentId
- sourcePage
- priority / confidence
- isActive

既存PartNameTerm案を拡張するか、実部品側名称テーブルを分けるかはschema確認後に決定する。

## 検索ワード生成の設計前提

検索ワード生成はPartNameMaster.nameEnだけに依存させない。

組み合わせ候補:

- movementMaker
- movementCaliber
- baseMovementCaliber
- partRef
- メーカー原名
- 多言語名称
- supplier別検索方針
- language別検索方針

サイトごとに検索語・言語の優先順位を変更できるようにする。

PROVISIONAL部品も検索ワード生成に利用できる。ただし、その手入力名をメーカー公式名称やメーカー横断標準名として扱わない。

## 既存の確定済み内装部品差分

以下は従来調査で追加方針が確定済み。今回の方針変更で自動的に削除しない。

train_wheel:

- 秒カナ受け
- 秒カナ受けネジ
- 秒カナ押さえ
- 秒カナ押さえネジ
- 三番耐震穴石（上/下）
- 三番耐震受石（上/下）
- 三番耐震バネ（上/下）
- 四番耐震穴石（上/下）
- 四番耐震受石（上/下）
- 四番耐震バネ（上/下）

quartz:

- 五番受石（上/下）
- 五番耐震穴石（上/下）
- 五番耐震受石（上/下）
- 五番耐震バネ（上/下）

追加しない:

- 汎用 受石
- 汎用 穴石
- 五番耐震穴石座

fifth_wheel_quartz（クォーツ五番車）を通常使用対象とする。
train_wheel側の既存 fifth_wheel は新規利用対象にしないが、既存定義がある場合は削除しない。

## 現在Taskの対象範囲

- Cal固有PartsMaster中心の内装部品設計
- 部品名fallback表示要件
- 日本語標準名 / 日本語仮訳 / メーカー原名の保持方式
- Cal連動drill-down
- 候補にない部品の手入力 + PROVISIONAL保存 + VERIFIED昇格運用
- カテゴリー / 機能タグ設計
- TechnicalDocument / Cal紐付け要件
- 解説書閲覧ボタン要件
- 解説書未保有Calの暫定運用
- 多言語名称 / PartNameTerm再設計
- 既存schemaとUIへの最小変更案調査
- 既存部品検索・検索ワード生成との接続確認

## 対象外

- 外装部品マスタの本実装
- QRタグ
- 作業可能判定
- 作業優先順位
- スケジュール
- 事例公開
- LINE
- 顧客コメント
- RepairWorkActionの変更
- RepairWorkCategoryの推測追加
- PricingRuleの不要な変更
- アプリ内AI PDF解析の本実装

帳票そのものの改修はこのTaskで無条件に触らない。ただし、将来すべての表示箇所で同一fallbackルールを使う要件は保持する。

## 次の作業

1. 現行schema / seed / RepairEntryForm / 部品検索実装を再確認し、新方針に必要な最小差分を設計する
2. PartsMaster.nameJp必須、Legacy name、PartNameMasterとの関係をどう変更するか比較案を作る
3. Cal→PartsMaster→カテゴリー→部品のdrill-downに必要な関連モデルを設計する
4. PROVISIONAL / VERIFIED状態、手入力保存、重複統合、他Cal非継承を実現する最小schema/UI差分を設計する
5. カテゴリー主分類 + 機能タグの要否とschemaを検討する
6. TechnicalDocumentとCalの関連モデル、保存先非依存の参照方式を設計する
7. baseCal資料参照・代替資料・未登録Cal一覧の要否を確定する
8. 新Cal投入用のレビュー形式とCodex投入手順を標準化する
9. 既存の部品検索・検索ワード生成を新しい名称データへ段階的に接続する

## 禁止事項

- メーカー資料を見ずにクロノグラフ等の部品を日本語共通名へ推測統合しない
- 英語名だけを見て部品の同一性を断定しない。可能な限り展開図の形・位置・作用を確認する
- Calに存在しない部品を通常候補へ出す設計にしない
- PROVISIONAL部品を資料確認なしで他Calへ自動継承・展開しない
- PROVISIONALの手入力名をメーカー公式名称として扱わない
- PartsMaster.subcategoryを新しい機能グループ用途へ流用しない
- targetPartNameId と partsMasterId を混同しない
- external_labor に PartsMaster を使わない
- part_external に PricingRule を使わない
- schemaを既存参照調査なしで決め打ちしない
