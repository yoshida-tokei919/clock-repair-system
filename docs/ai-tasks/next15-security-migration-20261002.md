# Next.js 15 security migration — 2026-10-02

Status: production complete

## Purpose and implementation

Next.jsのsecurity stackを更新した。Application commit: `ebffadf870d3092f84e649fb5c142c369a58bb88` (`fix: upgrade Next.js security stack`)。

- Next.js `14.1.0` → `15.5.27`、React / ReactDOM → `19.3.0`、`eslint-config-next` → `15.5.27`、`@types/react` / `@types/react-dom` → `19.3.0`、`lucide-react` → `0.475.0`、`react-dropzone` → `17.0.0`。
- Next 15 Async Request APIに合わせて`params` / `searchParams` / `cookies`を移行。
- React-PDF互換のためlocal `ReportPDFViewer` wrapperを使用。
- Next 15 buildが自動で要求した`tsconfig` target `ES2017`を追加。
- `postcss` `8.5.28`をdirect devDependencyに追加し、overrideを`next`配下だけに限定。
- `next-auth`は`4.24.13`のまま。更新は別follow-up taskとする。
- schema / migration / Supabase / business rule / UI redesignの変更なし。

## Validation and dependency audit

- 独立read-only Codexレビュー: blocking findingsなし。
- `npx tsc --noEmit` PASS。関連regression tests 20/20 PASS。`npm run build` local PASS。`git diff --check` PASS。
- Railway build PASS（Next.js `15.5.27`、static pages 56/56）。
- `npm audit` task前: total 21（low 2、moderate 3、high 14、critical 2）、production 8。task後: total 13（low 2、moderate 3、high 7、critical 1）、production 5（low 1、moderate 1、high 2、critical 1）。
- PostCSS / Nanoidのadvisoryは解消。残るproduction criticalは`next-auth <=4.24.14`。その他のproduction findingsにはtransitive `picomatch` / `postcss-selector-parser` / `uuid` / `ws`が含まれ、未解消。
- `npm run lint`はcompletion gateに含めず。repoにESLint configがなく、初回用の一時configでは本Taskと無関係な既存lint errorが出た。一時configは削除し、lint architectureの変更なし。

## Deployment and production smoke

- Source: GitHub `main` → Railway、exact commit `ebffadf870d3092f84e649fb5c142c369a58bb88`。
- Railway deployment: `cfe7be54-9a60-4be2-ade9-083611482b23` — `SUCCESS`。Region: `sin`。Runtime: Next.js `15.5.27`、Ready in 451ms。
- Production smoke: `GET /` → 200、`GET /login` → 200、`GET /cases/gallery` → 200、unauthenticated `GET /repairs` → 307 to NextAuth、unauthenticated `GET /storage-locations` → 307 to NextAuth、unauthenticated `GET /api/repairs/1/planning` → 401。
- Railway HTTP logs: 上記smoke requestのupstream errorなし。
- Production tag: `production-next15-security-20261002`。
- Supabase migration: none for this task。schema / migration / DB変更なし。

## Follow-up

残るproduction advisory、特に`next-auth` `4.24.13`のcriticalは別Taskで扱う。Stage Bの次候補Task198Dは引き続きuser approval待ち。このsecurity migration完了はTask198D開始の承認ではない。
