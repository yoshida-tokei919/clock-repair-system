# 詳細版マニュアル監査 — 2026-10-05

Production: pending

## 監査範囲

`docs/manual/full/` の第1〜39章を対象に、章番号、相対リンク、未実装機能の表現、章間の矛盾、Task203Eの実行環境表現を確認した。第26章はTask202B / Task204未完成のため、この監査Taskでは作成せず、次の独立Taskで現行制限としての扱いを決める。

## 機械監査

- 数値章ファイル: 38件
- 欠番: 第26章のみ
- 重複番号: なし
- 詳細版Markdown内の相対リンク: 127件
- 存在しない相対リンク: 0件
- `git diff --check`: PASS

## 未実装機能の表現監査

Task202Aは発送履歴CSVのread-only previewまでであり、追跡番号、実発送日時、配達完了日時、Shipment / Repair statusを書き戻さないことを確認した。`10/0A = 引受予定`は実際の郵便局引受の証拠として扱わない。

Task202B / Task204に属する実引受判定、追跡番号保存、配送状態更新、LINE発送通知、配達完了からRepair納品済みへの自動連携は、完成済み機能として扱わない。第1・3・22・25・34・35・36・37・39章の制限表現はこの境界と整合している。

第2章の全体フローだけは未実装の配送後半が現行フローと同じ見た目で並んでいたため、現行のCSV出力・read-only previewと、`[後続実装]`の実引受・LINE発送通知・配達完了連携を図中で明示的に分離した。

## Task203E / LINE sender監査

production deploymentのsource commit `3ac7067dad80d4463f9e897167cad46d270fb4ab` と、Windows Scheduled Taskの稼働状態は別の事実として扱う。

2026-10-05のread-only確認では `ClockRepair-LineManagerSender` は登録済み・Enabledだったが、監査時点のstateは`Ready`、直近実行結果は`1`だった。このため第28章の固定的な`Running / Enabled`表現を修正し、deploy済みだけではlocal senderの現在稼働や送信成功を断定しない記述へ変更した。障害時はScheduled Task state / LastTaskResult、runtime version、logs、Outboxを個別に確認する。

## 画像・図の未解消プレースホルダー

最終製本前に次の表示用プレースホルダーを解消する。

- 第5章: `inquiry-list.png`
- 第9章: `estimate-entry.png`（実ファイルは既に存在するため参照へ置換可能）
- 第9章: `estimate-document-create.png`
- 第11章: `estimate-parts-search.png`
- 第29章: `n8n-runtime-overview.svg`
- 第30章: `slack-inquiry-notification-sample.png`
- 第30章: `slack-outbox-flow.svg`

既存画像と内容が一致するものは既存assetを再利用し、存在しない画像を架空の実画面として作らない。実画面を追加する場合は非顧客データを使用し、token・cookie・secret・署名付きURL・個人情報を含めない。

## 第26章の扱い

詳細版目次には第26章「発送・追跡・配達完了」があるが、章ファイルは存在しない。これは現時点で唯一の章欠番である。この監査Taskでは埋めない。次Taskで「未実装の完成機能を説明する章」ではなく、現行制限・手動確認・後続Task境界を安全に説明する章として作るかを決定する。

## 結論

詳細版の章番号重複と相対リンク切れはない。未実装配送機能の完成済み表現については、第2章のフローを修正した。LINE senderはアプリdeployとWindows runtime状態を分離した。残る構造的な欠落は第26章、表示用の欠落は上記画像・図プレースホルダーであり、後続の章26整理・最終製本Taskで解消する。
