# 第18章 StorageLocationと棚・箱の運用

## 18.1 案件状態と現物の置き場所は別物

Repair.statusは「業務上どの工程にいるか」を表し、StorageLocationは「時計現物が実際にどこへ置かれているか」を表す。

この2つを分離することで、statusを変えただけで現物が移動したことにせず、実際に時計を移動した後で保管場所を記録できる。

## 18.2 初期9ゾーン

現在の標準StorageLocationは次の9ゾーンである。

| 管理コード | ゾーン名 |
| --- | --- |
| LOC-000001 | 受付処理待ち |
| LOC-000002 | 見積り待ち |
| LOC-000003 | 見積り調査中 |
| LOC-000004 | 承認待ち |
| LOC-000005 | 部品待ち |
| LOC-000006 | 作業待ち |
| LOC-000007 | ランニングテスト中 |
| LOC-000008 | 発送・引渡し待ち |
| LOC-000009 | 要確認 |

「箱がstatusそのもの」という運用ではなく、アプリが案件状態を管理し、箱・棚は現物を見つけやすくするための場所として扱う。

## 18.3 Repair詳細の現在地表示

Repair詳細ではactiveなStorageLocationAssignmentを現在地として表示する。

表示内容:

- 保管場所名
- 管理コード
- 種別
- 割当日時
- 所属ゾーン
- 推奨ゾーン
- 許容ゾーン
- 現在地との判定
- 判定根拠
- 必要に応じた要確認メッセージ

![Storage location](../assets/screenshots/storage-location-panel.png)

active assignmentがない場合は「保管場所未登録」と表示する。

## 18.4 現物受付直後

Repair statusが `受付` の場合、標準の推奨ゾーンは `受付処理待ち` である。

現物到着時の基本手順は次のとおり。

1. Repairを `受付` にする。
2. PhysicalTagを発行・割当する。
3. 修理袋ラベルを印刷する。
4. 時計を収納袋へ入れる。
5. `受付処理待ち` へ置く。
6. StorageLocationAssignmentを登録する。
7. Repair詳細で「一致」になっていることを確認する。

## 18.5 推奨ゾーンは自動移動ではない

アプリはRepair.status、approvalStatus、作業中断、部品準備状態等から推奨・許容ゾーンをread-onlyで導出する。

推奨結果は「この場所が望ましい」という案内であり、現物やDBを自動移動しない。
時計を実際に移動してから、Location moveを明示確定する。

## 18.6 主な推奨ルール

- `送付待ち` — 現物受領前なのでStorageLocationを期待しない
- `受付` — 受付処理待ち
- `見積中` — 見積り待ち。見積り調査中も許容
- `承認待ち` — 承認待ち
- 部品待ち系status — 部品待ち
- `作業待ち` — 部品準備状態等を確認して作業待ちまたは部品待ち
- `作業中` — 作業台上等の未割当も許容する場合がある
- `作業完了` — blocked等の優先条件がなければランニングテスト中を推奨し、発送・引渡し待ちも許容。blocked中は中断理由を優先
- `納品済み` — activeな保管場所が残っていれば不一致
- 判断不能・例外 — 要確認

## 18.7 Location move

共通ScanSessionの `LOCATION_MOVE` modeでは、先に移動先StorageLocationをscanし、その後に時計側のPhysicalTagを連続scanする。

```text
LOCATION_MOVEを選択
  ↓
移動先Locationをscan
  ↓
PhysicalTagを1件または複数scan
  ↓
対象Repair一覧を確認
  ↓
「この保管場所へ移動」を明示実行
  ↓
旧assignmentをrelease
  ↓
新assignmentを作成
```

scanしただけではStorageLocationAssignmentを変更しない。

## 18.8 履歴を残す

保管場所を移すと、旧assignmentを削除せずrelease日時を記録し、新しいassignmentを作成する。
これにより「現在地」だけでなく移動履歴を追跡できる。

同じLocationへ再度移動する場合はno-opとして扱う。

## 18.9 棚卸し

`LOCATION_AUDIT` modeでは、先に棚卸し対象Locationをscanし、その後PhysicalTagを連続scanする。

照合結果は次のように分類される。

- MATCH — そのLocationに登録済みで、実物もscanされた
- OTHER_LOCATION — DB上では別Location
- UNASSIGNED — 保管場所未登録
- MISSING — DB上はそのLocationだが、今回scanされていない

棚卸しscanはread-onlyであり、自動で現物位置やRepair.statusを変更しない。

## 18.10 作業完了後のランニングテスト運用

Repair.statusが `作業完了` で、RepairPlanningStateが中断中ではない通常ケースでは、現物の推奨保管zoneは `ランニングテスト中` になる。

`blocked=true` の場合は中断理由が優先され、`WAITING_PARTS` なら `部品待ち`、それ以外のblocked理由なら `要確認` を推奨する。画面の推奨zoneを確認してから現物を移動する。

現物を実際に移動してからScanSession `保管場所移動` でLocationを更新する。

```text
Repair = 作業完了
  ↓
推奨zone = ランニングテスト中
  ↓
現物をランニングテスト場所へ移す
  ↓
LOCATION_MOVEでLocation + PhysicalTagをscan
  ↓
「この保管場所へ移動」
```

現行アプリにはランニングテスト完了専用イベントがまだないため、`ランニングテスト中` はStorageLocationでありRepair.statusではない。

テスト・最終確認が終了したら、人が結果を確認して現物を `発送・引渡し待ち` へ移す。作業完了LINEやShipment工程へ進む前に、現物の実際の状態と現在地を確認する。
