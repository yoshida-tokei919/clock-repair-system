# Task 108-10AU: 共有ページコメントが案件詳細画面から消えた原因調査

## 目的

共有ページ経由で顧客・取引先が書き込んだコメントが、管理側の案件詳細画面で見えなくなった原因を調査する。

今回は調査のみとし、修正実装、schema変更、migration追加、seed変更、UI修正、API修正、data migration、commit は行わない。

## 背景

顧客共有ページには、修理案件ごとのコメント入力欄がある。

以前は、共有ページから送信されたコメントを管理側の案件詳細画面で表示していた。現在、ユーザーから「詳細画面から表示が消えた」と報告があったため、保存先、共有ページ側、管理側詳細画面、git履歴を確認した。

## 調査対象

主に以下を確認した。

- `prisma/schema.prisma`
- `src/app/customer/repairs/[token]/page.tsx`
- `src/app/customer/repairs/[token]/CustomerRepairActions.tsx`
- `src/app/api/customer/repairs/[id]/messages/route.ts`
- `src/app/api/customer/repairs/[id]/approve/route.ts`
- `src/app/api/customer/repairs/[id]/reject/route.ts`
- `src/app/api/repairs/[id]/messages/route.ts`
- `src/app/api/repairs/[id]/messages/read/route.ts`
- `src/app/(app)/repairs/[id]/page.tsx`
- `src/app/(app)/repairs/[id]/edit/page.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/(app)/repairs/page.tsx`
- `src/components/repairs/RepairsTableClient.tsx`
- `docs/ai-tasks/039-4-b2b-shared-page-spec.md`
- `docs/ai-tasks/108-10G-improve-repair-entry-form-readability.md`
- `docs/ai-tasks/108-10H-reorganize-repair-entry-form-layout.md`

## 現在の保存先

現在の保存先は `RepairCustomerMessage` model。

schema:

```prisma
model RepairCustomerMessage {
  id         Int       @id @default(autoincrement())
  repairId   Int
  body       String
  createdAt  DateTime  @default(now())
  readAt     DateTime?
  senderType String    @default("partner")

  repair     Repair    @relation(fields: [repairId], references: [id])

  @@index([repairId, readAt])
}
```

`Repair` 側には relation として `customerMessages RepairCustomerMessage[]` がある。

`Repair.customerNote` も存在するが、これは「見積書・共有ページ等で顧客へ伝える説明文」であり、共有ページから送られるコメントの保存先ではない。

`RepairStatusLog.note` や専用 `CustomerResponse` model は現行 schema には見当たらなかった。

## 共有ページ側の現状

共有ページ側のコメント入力欄は残っている。

`src/app/customer/repairs/[token]/CustomerRepairActions.tsx` では、コメント欄 `comment` state があり、コメント送信時に以下を呼ぶ。

```ts
await postAction("messages", { body: comment });
```

送信先は `src/app/api/customer/repairs/[id]/messages/route.ts`。

現在の保存処理は以下。

```sql
INSERT INTO "RepairCustomerMessage" ("repairId", "body", "senderType")
VALUES (${repairId}, ${messageBody}, 'partner')
RETURNING "id", "body", "createdAt"
```

`[id]` は数値IDだけでなく、`findRepairIdByIdOrToken(params.id)` により `publicToken` からも repairId を解決できる。

共有ページの表示側 `src/app/customer/repairs/[token]/page.tsx` は `customerMessages` を include しており、`CustomerRepairActions` へ `messages={latestMessages}` を渡している。

承認・差戻し API も存在する。

- `src/app/api/customer/repairs/[id]/approve/route.ts`
- `src/app/api/customer/repairs/[id]/reject/route.ts`

差戻しではコメント本文を受け取り、承認状態を `rejected` に更新する設計がある。

## 管理側詳細画面の現状

管理側詳細画面の route は `src/app/(app)/repairs/[id]/page.tsx`。

この page は現在 `customerMessages` を include している。

```ts
customerMessages: {
  orderBy: { createdAt: 'desc' },
  select: { id: true, body: true, createdAt: true, readAt: true }
}
```

取得した `repair` は `initialData` として `RepairEntryForm mode="view"` に渡される。

`src/components/repairs/RepairEntryForm.tsx` には、現在も以下の state / 派生値がある。

```ts
const [showCustomerComments, setShowCustomerComments] = useState(false);
const customerMessages = initialData?.customerMessages || [];
const unreadCustomerMessageCount = customerMessages.filter((message: any) => !message.readAt).length;
```

管理側詳細画面の表示ブロックも残っている。

表示は初期状態で以下のような1行要約になっている。

```txt
共有ページコメント 0件 [開く]
```

`開く` を押した場合のみ、コメント一覧、返信欄、返信ボタンが表示される。

したがって、現HEADでは「保存先がなくなった」「共有ページ側が保存しなくなった」「詳細ページが取得しなくなった」「RepairEntryFormから表示ブロックが完全削除された」という状態ではない。

## view/edit mode の現状

`src/app/(app)/repairs/[id]/edit/page.tsx` は現在 `/repairs/[id]` へ redirect する。

```ts
redirect(`/repairs/${params.id}`);
```

そのため edit page 固有のコメント表示差分はない。詳細画面は `RepairEntryForm mode="view"` に集約されている。

## 一覧画面の現状

`src/app/(app)/repairs/page.tsx` は、一覧の対象 repairIds に対して未読コメントだけを `RepairCustomerMessage` から raw SQL で取得している。

```sql
SELECT DISTINCT ON ("repairId") "id", "repairId", "body", "createdAt"
FROM "RepairCustomerMessage"
WHERE "repairId" IN (...)
  AND "readAt" IS NULL
ORDER BY "repairId", "createdAt" DESC
```

`RepairsTableClient` では未読コメントがある場合に点を表示し、ダイアログで本文を確認できる。既読にすると `src/app/api/repairs/[id]/messages/read/route.ts` が `readAt = NOW()` を入れる。

一覧は未読コメントだけを表示対象にしているため、既読済みコメントは一覧上では見えない。ただし詳細画面は readAt の有無に関係なく全件を取得している。

## git履歴調査結果

指定された履歴検索を中心に確認した。

関連が強い commit:

- `346bf80 Add customer comments and LINE estimate sharing`
- `493061e Implement shared estimate approval workflow`
- `94be2b1 Improve B2B shared estimate page workflow`
- `d5b856a feat: improve repair entry layout and structured work persistence`

`git log -S "customerMessage"` では、主に以下が出た。

- `346bf80`
- `493061e`
- `94be2b1`
- `d5b856a`

`git log -S "message"` でも、共有ページ・コメント・LINE関連として同系統の commit が出た。

## 怪しいcommit

### 最有力: `d5b856a feat: improve repair entry layout and structured work persistence`

理由:

- この commit で `RepairEntryForm` の共有ページコメント欄が、常時展開表示から初期1行要約 + 開閉式へ変更されている。
- `customerMessages` 取得は削除されていない。
- 表示ブロックも削除されていない。
- ただし初期状態では本文が見えず、`開く` を押さないとコメント一覧が表示されない。

差分の要点:

```txt
変更前:
共有ページコメント欄が常時展開され、コメント一覧と返信欄が見えていた。

変更後:
共有ページコメント 0件/未読n件 + [開く] の1行要約になり、
開いた時だけコメント一覧と返信欄が出る。
```

関連docs:

- `docs/ai-tasks/108-10G-improve-repair-entry-form-readability.md`
- `docs/ai-tasks/108-10H-reorganize-repair-entry-form-layout.md`

108-10G には「共有ページコメント欄を初期状態では1行要約として表示する形に変更」と明記されている。

108-10H には「共有ページコメント欄を初期1行要約 + 開閉式へ変更」「横幅いっぱいの常時表示には戻していない」と明記されている。

### 導入commit: `493061e Implement shared estimate approval workflow`

理由:

- `src/app/(app)/repairs/[id]/page.tsx` に `customerMessages` include を追加した。
- `RepairEntryForm` に共有ページコメント表示ブロックと工房側返信機能を追加した。
- `src/app/customer/repairs/[token]/page.tsx` を追加し、共有ページ側でも `customerMessages` を取得した。
- `src/app/api/customer/repairs/[id]/messages/route.ts` を token 解決対応に変更した。

この commit は「消した」commit ではなく、詳細画面表示を成立させた commit。

### 関連: `94be2b1 Improve B2B shared estimate page workflow`

理由:

- `RepairCustomerMessage.senderType` を使う方向へ共有ページのコメント表示を整理した。
- 共有ページ側のコメント履歴表示は大きく再構成された。
- 管理側詳細の表示削除ではない。

### 導入commit: `346bf80 Add customer comments and LINE estimate sharing`

理由:

- `RepairCustomerMessage` model を追加した。
- 顧客コメント送信APIを追加した。
- 一覧画面に未読コメント表示を追加した。

この commit は保存先と一覧表示の導入元。

## 関連Task

関連性が高い Task / docs:

- `039-4-b2b-shared-page-spec.md`
  - B2B共有画面、コメント senderType、共有ページ仕様。
- `108-10G-improve-repair-entry-form-readability.md`
  - 共有ページコメント欄を初期1行要約へ変更。
- `108-10H-reorganize-repair-entry-form-layout.md`
  - 108-10G の折りたたみ状態を維持し、常時表示には戻していない。

関連する実装commit:

- `346bf80 Add customer comments and LINE estimate sharing`
- `493061e Implement shared estimate approval workflow`
- `94be2b1 Improve B2B shared estimate page workflow`
- `d5b856a feat: improve repair entry layout and structured work persistence`

## 消えた原因の仮説

最も可能性が高い原因は、`d5b856a` / 108-10G / 108-10H で、管理側案件詳細の共有ページコメント欄が「常時表示」から「初期1行要約 + 開閉式」に変更されたこと。

表示自体は削除されていないが、初期状態では本文が見えないため、以前のように詳細画面を開いただけでコメント本文が見える挙動ではなくなっている。

また、共有ページコメント欄は上部の細いバーとして表示されるため、画面上で見落としやすい。

もし実画面で件数が `0件` になる場合は、別原因として以下を疑う。

- 共有ページが `Repair.publicToken` ではなく `EstimateDocument.publicToken` 経由で表示され、対象 repair の解決はできているが、コメント投稿先 token が別 repair に寄っている。
- `readAt` の既読化により一覧画面では見えなくなっている。
- コメントは `RepairCustomerMessage` に保存されているが、見ている repairId が違う。
- ローカルDBや本番DBで `RepairCustomerMessage` migration / column 状態が一致していない。

ただし、現コード上は詳細画面が `customerMessages` 全件を取得しているため、同じ repairId に保存されている限り、既読済みでも詳細画面には表示される。

## 復旧する場合の最小修正案

### 案A: 共有ページコメント欄を初期展開に戻す

最小案。

`RepairEntryForm` の `showCustomerComments` 初期値を、コメントがある場合だけ true にする。

例:

```ts
const [showCustomerComments, setShowCustomerComments] = useState(
  (initialData?.customerMessages || []).length > 0
);
```

schema / migration / API 変更なしで、以前に近い見え方へ戻せる。

### 案B: 1行要約は残し、最新コメント本文を1件だけ常時表示する

コメント欄の高さを抑えつつ、「消えた」と見えないようにする案。

例:

```txt
共有ページコメント 2件 / 未読1件
最新: ここに最新コメント本文の先頭行...
[開く]
```

schema / migration / API 変更なし。

### 案C: 案件詳細の目立つ場所に未読コメントバッジを追加する

コメント欄は折りたたみのまま維持し、未読がある場合だけ目立つ導線を追加する案。

schema / migration / API 変更なし。

### 案D: 専用 CustomerMessage model を作る

非推奨。

既に `RepairCustomerMessage` が存在し、保存・取得・返信・既読化まで実装されているため、今回の復旧目的では schema 変更は不要。

## 今回やらないこと

- 修正実装
- schema変更
- migration追加
- seed変更
- UI修正
- API修正
- data migration
- commit
- 帳票 / PDF / LINE / 共有ページ / PublicCase の変更
- 関係ないリファクタ

## 次Task案

- 108-10AV: 共有ページコメント欄の初期表示復旧
- 108-10AW: 共有ページコメントのDB実データ確認と repairId/token 対応調査
- 108-10AX: 未読コメントの管理側視認性改善

## 調査メモ

現HEADでは、共有ページコメントの保存先、送信API、詳細ページの取得、`RepairEntryForm` の表示ブロックはいずれも存在する。

今回の不具合は「機能削除」よりも「初期表示が折りたたまれ、本文が見えなくなった」UI回帰の可能性が高い。
