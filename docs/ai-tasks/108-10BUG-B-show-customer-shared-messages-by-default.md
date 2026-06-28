# Task 108-10BUG-B: 顧客共有ページコメントの初期表示復旧

## 目的

共有ページ経由で顧客・取引先が書き込んだコメントを、管理側の案件詳細画面で見落としにくくする。

コメントが存在する案件では、ユーザーがまだ開閉操作していない限り、顧客コメント欄を自動展開する。

## 原因

`RepairEntryForm` の共有ページコメント欄は、`showCustomerComments` が以下のように固定で初期化されていた。

```ts
const [showCustomerComments, setShowCustomerComments] = useState(false);
```

そのため、`customerMessages` が初回 render 時点で空で、後から props / state 更新で1件以上になっても、コメント欄は自動で開かなかった。

保存後の再取得 / 再render により `customerMessages` が入っても、`showCustomerComments` が false のままだと本文は見えず、詳細画面からコメントが消えたように見える状態になっていた。

## 修正内容

`showCustomerComments` とは別に、ユーザーがコメント欄の開閉ボタンを操作したかどうかを示す state を追加した。

```ts
const [userTouchedCustomerCommentsToggle, setUserTouchedCustomerCommentsToggle] = useState(false);
```

`customerMessages.length > 0` かつ `userTouchedCustomerCommentsToggle = false` の場合だけ、`useEffect` でコメント欄を自動展開する。

```ts
useEffect(() => {
    if (!userTouchedCustomerCommentsToggle && customerMessages.length > 0) {
        setShowCustomerComments(true);
    }
}, [customerMessages.length, userTouchedCustomerCommentsToggle]);
```

開閉ボタンを押した場合は、ユーザーが意図的に操作したものとして `userTouchedCustomerCommentsToggle = true` にする。

これにより、コメントが後から1件以上になった場合は自動で表示される。一方で、ユーザーが手動で閉じた後は、再取得や再render が起きても勝手に開き直さない。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`

## 検証結果

以下を実行し、成功した。

```powershell
npx tsc --noEmit --pretty false --incremental false
```

## 影響範囲

顧客コメント表示ブロックのみ。

既存の開閉ボタン、コメント一覧、返信欄、返信ボタンは維持した。

## 触っていないもの

- schema
- API
- 共有ページ
- `RepairCustomerMessage` 保存処理
- 帳票
- PDF
- LINE
- PublicCase
- PricingRule
- 外装Task関連
