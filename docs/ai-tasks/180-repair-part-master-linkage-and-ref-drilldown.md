# Task180: repair-entry PartsMaster 標準名連携と外装部品 Ref ドリルダウン

## 確定した境界

- `PartNameMaster` は表記を統一する管理済み標準部品名であり、修理入力から自動作成しない。新たな内装・外装 PART 行には部品カテゴリと既存 `PartNameMaster` の選択を必須にする。`PartsMaster` は修理操作から成長し得る。
- 外装 PART は Brand → 現在の Product Ref / 保存済み Case Ref → `PartCategoryMaster` → `PartNameMaster` → `PartsMaster`。Ref が一つでもあれば `watchRefs` の正規化済み完全トークン一致を要し、Model fallback は使わない。Ref がなければ Brand + Model fallback を維持する。
- 外装 LABOR は Brand → Model → `RepairWorkCategory` → `PartNameMaster` → `RepairWorkAction` → detail → `PricingRule` のまま。Ref を価格照合に加えない。内装部品は movement maker + movement Cal / base maker + base Cal の条件を維持する。
- `RepairLineItem.targetPartNameId` は LABOR の意味を維持する。PART の標準名 ID は修理入力から `PartsMaster.standardPartNameId` へ渡し、既存の ID は入力省略で消さない。異なる非 null 標準名 ID の PartsMaster を名前または部品 Ref による既存候補とみなさない。null の旧行は正規化名の完全一致時だけ補完対象にする。
- 新規外装部品には分かっている Product Ref と既存 Case Ref を重複排除して保存し、既存 `watchRefs` を更新時に残す。Case Ref 入力欄は追加しない。
- 部品パネルの選択は実 PartsMaster を読み直し、現在の Brand・Ref・標準部品名との適合を確認してから反映する。保存 API も同じ外装適合条件を検査し、不一致を HTTP 400 で拒否する。
- 部品パネルの汎用検索結果は既存のまま表示する。選択時と修理保存時の判定で不適合な部品を拒否する。
- 新規外装部品と既存 PartsMaster の自動統合では、両側に対応 Ref があるとき完全トークンの重複を必須とする。現在 Ref があり候補に Ref がない旧行は、双方の Model ID が非 null で一致し、正規化した部品 Ref の完全トークンが重複するときだけ再利用する。現在 Ref がない Model fallback では既存の Brand・標準名・grade・Model 条件と、部品 Ref がある場合の完全トークン一致を維持する。
- 修理保存で新規 PART は有効かつ内外装区分が合う標準部品名 ID を必須とする。既存部品の異なる非 null ID は拒否し、null 旧行の補完は DB の標準部品名の日本語正式名または表示名との完全一致だけで認める。自由入力の検索語・明細名は同一性の証拠に使わない。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`: 部品カテゴリ・DB の標準部品名 ID の必須確認、候補と PART 行への ID 伝播、保存済み ID と `repairLineItemId` の復元・送信、Product/Case Ref による PART 候補照合。
- `src/actions/master-actions.ts`: `getPartsMatched` の標準名・外装 Ref 条件。外装 LABOR/PricingRule の検索には変更なし。
- `src/lib/parts-master-compatibility.ts`: Ref トークン照合・マージ、標準名の照合と既存値保持。
- `src/lib/parts-master-compatibility.test.ts`: Ref、Model fallback、標準名 ID、旧行、Ref の異なる自動統合拒否、保存済み行リンク判定、修理専用/汎用 PartsMaster 経路のテスト。
- `src/lib/repair-part-validation.ts`: POST/PATCH 共通の標準部品名・既存部品適合検証、保存済み PART 行と部品の組による例外判定、HTTP 400 用エラー。
- `src/lib/parts-master.ts`: 既存 PartsMaster の標準名・Ref 不一致を統合対象から除外し、適合確定後に標準名 ID と Ref を保持・統合。修理専用の厳格な内装照合をサーバー内オプションで分離。
- `src/components/parts/PartsSearchPanel.tsx`: パネルで選択した標準部品名 ID を選択結果へ渡す。
- `src/app/api/repairs/route.ts`: POST の新規/既存 PartsMaster へ標準名 ID と現在の対応 Ref を渡し、保存前に共通検証。
- `src/app/api/repairs/[id]/route.ts`: PATCH の同処理と保存済み Case Ref の読み取り。
- `src/app/(app)/repairs/[id]/page.tsx`: 保存済み `Watch.caseReference`、`PartsMaster.standardPartNameId`、対応する PART `RepairLineItem.id` をフォーム初期値へ含める。
- `docs/ai-tasks/180-repair-part-master-linkage-and-ref-drilldown.md`: この Task 記録。

Schema/migration、PartNameMaster の元リスト、foundation data、production DB は変更していない。commit、push、deploy、tag は行っていない。`stash@{0}` は触っていない。
Task179 記録上の現行 Railway application commit は `c674be7c0d70e697bda787d9c28dc35e6c928240`。この Task では production への再照会を行っていない。

## 独立レビュー指摘と修正

初回の独立レビューで P1 が4件あった。(1) PartsSearchPanel からの選択が外装 Ref・標準名条件を迂回できる、(2) 同じ部品 Ref/名だけで異なる非空 watchRefs を持つ外装マスタが自動統合される、(3) 修理 POST/PATCH が新規 PART の標準名必須・既存 ID 衝突・旧 null 行の補完を保護できない、(4) 自由入力 searchTerm が旧 null 行の標準名同一性判定に使われる、という指摘。

- パネルの選択時に実部品を再取得し、選択済み/保持済み標準名、現在の Brand、Product Ref と保存済み Case Ref の完全トークン適合を確認する。POST/PATCH でも同じ条件を保存前に検証し、不適合は 400 を返す。Ref があれば Model fallback はしない。
- 新規外装部品の既存候補は、両側に非空 Ref があれば重複を必須にした。Ref 欠損時も明確に異なる Model は統合しない。安全な同一性判定後だけ旧 watchRefs を保持して重複なく追加する。
- 新規 PART の標準名 ID は既存で有効かつ内外装区分の合う `PartNameMaster` から必須選択とした。既存 PartsMaster の ID 省略は保持し、異なる非 null ID は拒否する。旧 null ID の補完は DB の日本語正式名/表示名との正規化完全一致だけで許す。修理保存用の既存 PartsMaster 更新経路でも標準名 ID と watchRefs を保持し、ID 衝突を拒否する。単独の PartsMaster 編集経路は変えていない。
- 自由入力名・検索語を旧 null ID の同一性証拠から除外した。検索語は候補の検索・順位付けにのみ使用する。

二回目の独立レビューで新たに P1 が2件見つかった。(1) 内装 PART のパネル選択と POST/PATCH が movement maker + Cal / base maker + base Cal の適合を検証していない、(2) Ref のない旧外装 PartsMaster に現在 Ref を弱い同一性だけで追加できる、という指摘。

- 内装 PartsMaster の共通純粋関数で、現在の完全な maker + Cal 組のどちらかと候補が一致し、標準部品名にも適合することを判定する。汎用部品パネルの選択と POST/PATCH の既存リンク保存に適用した。新規内装部品の自動再利用も同じ組を要求し、組がなければ別 PartsMaster を作る。既存リンクは現在の完全な組がない場合も再保存できる。パネルからの新しい既存部品選択は組がなければ拒否する。内装照合に watch Ref を追加していない。
- 現在 Ref があり候補に Ref がない旧外装部品は、双方の非 null Model ID 一致と、正規化した部品 Ref の完全トークン重複が揃う場合だけ再利用して Ref を追加する。揃わなければ別 PartsMaster を作る。双方の watchRefs が非空なら既存の完全トークン重複条件を維持する。現在 Ref がない Model fallback で候補側に Ref があっても、その Ref は消さない。

三回目（最終）の独立レビューでは、P1 が2件、P2 が1件残った。P1 は (A) POST と PATCH の新しい既存部品リンクが、単に `partsMasterId` があるだけで旧リンクの標準名 ID 省略例外を利用できること、(B) 完全な maker + Cal 組がない場合に、PATCH の新しい内装部品リンクも旧リンクとして通過できること。P2 は修理入力専用の厳格な内装再利用条件を汎用 PartsMaster 作成・編集にも適用していたこと。

- 修理画面の既存行は `EstimateItem.id` を表示用 ID として使っていたため、保存済み PART `RepairLineItem.id` を別の `repairLineItemId` として初期データから payload へ渡す。PATCH は当該 Repair の保存済み PART 行の `{id, partsMasterId}` を置換・削除より前に DB から読み、同じ組の場合だけ旧リンク再保存と判定する。POST は常に新リンク。auto、欠落、不正、他 Repair の ID、同じ行 ID でも異なる部品 ID は新リンクとする。
- 新リンクでは既存 PartsMaster でも有効な内外装区分に合う標準名 ID を必須にした。旧リンクで ID を省略したとき、PartsMaster 側が非 null なら現行 PartNameMaster の存在・有効性・区分を再検証する。旧 null は純粋な再保存のみ null を維持でき、ID を補完するときは正式名/表示名の正規化完全一致を要求する。
- 完全な maker + Cal 組がない内装の既存部品リンクは、同じ保存済み行と同じ PartsMaster の再保存だけ許可する。新リンクは拒否する。修理由来の新規内装部品は Cal を補わず、完全な組がなければ既存マスタを自動再利用せず別作成する。
- `createOrUpdatePartsMaster` の修理専用厳格照合は、修理 POST/PATCH だけが渡すサーバー内オプションに分離した。通常の `/api/parts`、単独編集、growth-preview は従来の nullable Cal/maker 候補照合を維持する。修理経路の標準名 ID 衝突保護は維持する。

最終独立レビューでは、過去の P1 #1–#9 はすべて CLOSED。残った P2 は、保存済み Repair の Product Ref を空欄にしても PATCH が旧 `referenceId` と旧 Ref を保持し、UI の Model fallback と保存 API の外装部品判定が食い違うことだった。

- PATCH で `watch.ref` の省略と明示的な空欄（trim 後）を区別する。明示的な空欄は `Watch.referenceId=null` とし、現在 Ref から Product Ref を除く。保存済み Case Ref は残るため、その場合は Model fallback を使わない。省略時だけ旧 Product Ref を保持し、非空値は従来どおり WatchReference を検索・作成する。
- 外装部品の現在 Ref 判定と新規部品の Ref には同じ解決結果を使う。Case Ref の UI・編集と外装 LABOR の Model ベース価格照合は変更していない。

## 自動確認

- `npx --no-install tsc --noEmit --incremental false`: PASS
- `npx --no-install tsx --test src/lib/parts-master-compatibility.test.ts`: 26/26 PASS。保存済み行と部品 ID の組による旧リンク判定、POST/新リンクの標準名必須、旧リンクの非 null/null 保持と非 null ID の再検証、内装 Cal 組なしの新リンク拒否、汎用 PartsMaster の旧候補再利用と修理専用オプションの別作成に加え、PATCH の Product Ref 空欄・省略・新規値と Case Ref による Model fallback の有無を確認した。
- `git diff --check`: PASS
- `next lint --file ...`: ESLint 設定の対話プロンプトが表示され、lint 自体は実行されなかった。

## 吉田による local 実画面確認

1. 新規 Repair の交換部品で、カテゴリ未選択または標準部品名未選択のまま追加し、エラーが出て行が増えないことを確認する。両方を選ぶと追加できることを確認する。
2. 外装部品で Product Ref を設定し、同一 Brand・標準部品名でも異なる Ref の PartsMaster は候補に出ず、複数値 `watchRefs` の一致するものだけが出ることを確認する。Case Ref のない保存済み Repair で Product Ref を空にすると Model fallback に戻り、保存後も空欄が維持されることを確認する。
3. Case Ref が登録済みの Watch を持つ保存済み Repair で、Product Ref または Case Ref のどちらかに対応する外装部品が候補に出ることを確認する。Case Ref 入力欄が増えていないことを確認する。
4. 既存 PART 行を再保存し、PartsMaster の標準名 ID と既存 `watchRefs` が消えず、新しい現在 Ref が重複なく追加されることを確認する。内装部品の movement Cal / base Cal 候補と外装 LABOR 価格候補も従来どおりであることを確認する。
5. 部品パネルで現在の Brand・Ref・標準名と合わない部品を選び、エラーが出て行が置き換わらないことを確認する。Ref があるときは同じ Model でも別 Ref の部品が拒否されることを確認する。
6. 内装 PART 行で、現在の movement maker + Cal または base maker + base Cal に合う既存部品をパネルから選べることを確認する。両組とも異なる既存部品はエラーとなり行が置き換わらないことを確認する。maker + Cal の完全な組がない場合、新しい既存部品のパネル選択は拒否され、既存リンク行の再保存はできることを確認する。
7. 現在 Ref がある外装 PART で、Ref のない旧 PartsMaster が同じ Model と完全一致する部品 Ref を持つ場合だけ再利用され、現在 Ref が加わることを確認する。Model 不一致、部品 Ref 不一致・部分一致なら別 PartsMaster になることを確認する。現在 Ref がない Model fallback では候補の既存 Ref が消えないことを確認する。

### 実施結果（2026-09-25 local）

- 1: PASS。新規 PART でカテゴリ・標準部品名の必須制御を確認。
- 2: PASS。Product Ref `16233` / `1623` / 空欄で、完全一致・部分一致拒否・Refなし時の Model fallback と空欄保存を確認。
- 3: PASS。保存済み Case Ref が Product Ref と OR 条件で効き、Product Ref 空欄でも Case Ref が残る間は Model fallback しないこと、Case Ref 入力欄を追加していないことを確認。
- 4: PASS。既存 PART 再保存後も `PartsMaster.standardPartNameId` と `watchRefs=16233` が保持され、Ref 重複がないことを DB で確認。外装 LABOR の Model 軸経路は Task180 で変更していないことを差分・独立レビューで確認し、今回の local 画面では価格候補の再操作は行っていない。
- 5: PASS。Ref `1623` で `watchRefs=16233` の既存外装部品を選ぶと「現在のブランド・Ref・標準部品名に適合しない部品です。」で拒否されることを確認。
- 6: PASS。`ROLEX + 3135` の完全な maker + Cal 組では既存内装部品を選択でき、Cal を外すと「現在のムーブメントメーカー・Cal・標準部品名に適合しない部品です。」で新規リンクが拒否されることを確認。別 Cal のローカル実データがないため異Calケースは自動テストで確認。
- 7: ローカル DB に `watchRefs` のない外装 legacy PartsMaster が存在しないため実画面では未実施。自動テストで、同一非 null Model + 完全部品Ref一致時のみ再利用して現在Refを追加し、Model不一致・部品Ref不一致/部分一致では別作成になることを確認。
- 手動確認中に、承認前 Repair で部品選択時に発注依頼作成が拒否され Unhandled Error になる既存挙動を確認した。Task180 には混ぜず、次Taskで「承認前でも発注依頼作成は許可し、在庫引当・案件ステータス進行は承認まで行わない」方向で対応する。

**Production: pending**。local 実画面確認と不足ケースの自動確認は上記のとおり。schema/migration/production DB write はなく、commit/push/deploy/tag は行っていない。
