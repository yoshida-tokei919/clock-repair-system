# 110-7 一括検索openとCousins UK URL修正

## 目的

部品Web検索の実画面確認で見つかった以下2点を、検索語生成ルールやsite profile構造を変えずに修正する。

- 複数サイトを選択した一括検索で1サイトしか開かない
- Cousins UKの既定検索URLが404になる

## 一括検索

### 原因

一括検索では、クリック後に複数URLへ対して `window.open(url, '_blank')` を連続実行していた。ブラウザのpopup blockerにより、ユーザー操作から離れた複数回目以降の `window.open` がブロックされやすい形だった。

### 修正

表示queryと同じ `profiledUrls` を使う流れは維持し、ユーザークリックイベント内で対象サイト数分の空タブを先に同期的に開いてから、それぞれの `location.href` に生成済みURLを設定する方式へ変更した。

空タブ自体を開けなかった件数がある場合は、画面内にブロック件数を表示する。

## Cousins UK URL

### 旧URL

```text
https://www.cousinsuk.com/search/products?q={query}
```

### 新URL

```text
https://www.cousinsuk.com/search?SearchTerm={query}
```

### localStorage対応

`normalizeSearchSites`で、`site.id === "cousins-uk"` かつURLが既知の旧default値と完全一致する場合だけ新URLへ移行する。

ユーザーが自分で登録・編集した任意URLは、旧default値と完全一致しない限り書き換えない。

## 変更しないこと

- internal/exterior判定
- stale state同期
- 検索語生成ルール
- alias / fallback
- site profile構造
- localStorage schema
- partRef保存API
- Prisma schema / migration
- PROVISIONAL / VERIFIED
- PublicCase

