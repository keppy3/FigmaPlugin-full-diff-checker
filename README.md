# Full Diff Checker（仮称）

Before/After（変更前後・ブランチ間・バージョン間）の見た目差分を検出し、比較対象のFigmaファイル内に**実ノードとしてレポートページを生成する**Figmaプラグイン。

内部構造の改善（バリアント名変更・インスタンス差し替えなど）が仕様書の見た目に影響していないことを機械的に示すためのツール。背景・設計判断の詳細は [spec.md](./spec.md) を参照。

> **状態**: v1実装（未検証）。実際のFigma環境でまだ動作確認していません。下記「テスト方法」に沿って動作確認し、issueとして問題を記録してください。

## セットアップ

```bash
npm install
npm run build   # dist/code.js, dist/ui.html を生成
npm run watch   # ファイル変更を監視して自動ビルド
npm run typecheck
```

## テスト方法（Figmaへの読み込み）

1. `npm run build` を実行し `dist/` を生成する
2. Figmaデスクトップアプリで任意のファイルを開く
3. 右クリック → Plugins → Development → Import plugin from manifest…
4. このリポジトリの `manifest.json` を選択
5. Plugins → Development → Full Diff Checker で起動

初回起動時はPersonal Access Token（[発行方法](https://www.figma.com/developers/api#access-tokens)、スコープ `file_content:read` `file_versions:read`）の入力を求められる。以降は `figma.clientStorage` に保存され、次回起動時はスキップされる。

## ディレクトリ構成

```
src/
  shared/
    messages.ts        # UIスレッド <-> メインスレッド間のメッセージ型定義
  main/                 # プラグイン本体（Figmaのサンドボックス、figma.* APIが使える）
    code.ts             # エントリポイント（メッセージルーティングのみ）
    config.ts           # レポートページ生成用の調整可能な定数
    storage.ts          # clientStorageへのトークン保存/読み込み
    report/
      buildReportPage.ts  # 新規ページ生成・画像フィル配置・blendMode:"DIFFERENCE"適用
  ui/                   # プラグインUI（iframe、DOM/fetchが使える）
    ui.html             # 3画面（初回ログイン / スキャン設定 / 実行ログ）のマークアップ
    ui.ts               # 画面遷移とスキャンパイプラインの実装
    uiConfig.ts          # しきい値・デフォルト解像度などの調整可能な定数
    figmaApi.ts          # Figma REST APIクライアント（files / versions / images）
    rateLimiter.ts        # REST API Tier1レート制限（15req/min）に対するペーシング
    scope.ts              # 属性×階層によるスキャン対象の解決
    match.ts              # Before/Afterのマッチングロジック（component.key / 名前+パス）
    diff.ts                # canvasによる差分率算出
scripts/
  build.js              # esbuildによるビルドスクリプト（main/uiそれぞれをバンドル）
manifest.json
spec.md                 # 仕様書（背景・設計判断の詳細）
```

なぜmain/uiでファイルを分けているか、なぜスコープ解決やマッチングがUIスレッド側にあるかは spec.md 2章・9章を参照。要点だけ言うと、Before/Afterは現在開いているファイルとは限らない（別バージョン・別ブランチのことが多い）ため、その解決はFigma REST APIを叩けるUIスレッド側で行い、メインスレッドは「できあがった行データを実ノードとして配置する」ことだけを担当する。

## 既知の制限・今後の調整ポイント（v1時点）

- Before/Afterのバージョン指定は、URL入力＋任意のバージョンID直接入力のみ対応。Version Historyから選ぶドロップアウトUIは未実装（`figmaApi.ts` の `fetchFileVersions` は用意済みで、UIを足すだけで繋げられる）。
- セクション/フレームの対応付けは「名前＋階層パス」ベースのため、リネームを伴う変更は「削除＋新規追加」として検出される（spec.md 9章）。
- レート制限のペーシング（`rateLimiter.ts`）は固定の待機時間方式。スキャン対象が非常に多い場合の挙動は未検証。
- 生成ページのAuto Layout詳細（行の高さ・余白・複数ページ分割など）は簡易実装。見た目の細部は今後調整想定。
- プラグイン名は仮称。`manifest.json` の `name` と本READMEを差し替えれば変更できる。

## ライセンス

社内利用ツール。ライセンス未設定。
