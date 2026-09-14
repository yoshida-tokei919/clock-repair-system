# Current state after Task166

更新日: 2026-09-14

Task166の在庫・発注フローはproduction実画面確認まで完了。

次のTaskはTask167。

現在このアプリは実運用前で、実業務はFMPを使用中。production DB内の既存案件・部品・発注データは開発用ダミーデータとして扱う。

通常の小さい変更は小さい単位で反映し、production実画面確認を早く回す。問題があれば小さい修正またはrevertで戻す。

RailwayはGitHub mainをproduction sourceとして自動deployするため、main更新はproduction反映を伴う前提で扱う。

schema / migration / 在庫 / 決済 / 認証は、通常変更より慎重に扱い、production互換性と適用順序を事前確認する。
