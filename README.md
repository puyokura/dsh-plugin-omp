# dsh-plugin-omp

DeepSeek Harness (dsh-TUI / dst) 向けの Cordis プラグインです。OMP (Oh My Posh) のセッション履歴を DSH に統合・移行し、シームレスに再開可能にします。

---

## 概要 (Overview)

`dsh-plugin-omp` は、DeepSeek Harness の TUI クライアント（`dst` / `dsh-tui`）環境において、以下の機能を提供する拡張プラグインです。

- **OMP 会話データの同期・インポート**: OMP セッションディレクトリ（`~/.omp/agent/sessions`）に保存されている会話履歴を走査し、DSH セッションストアへ移行します。
- **セッション閲覧と再開**: `/omp` スラッシュコマンドを用いて、OMP 側の会話一覧や接続ステータスを確認し、インポート後は標準の `/resume` コマンドからシームレスに会話を再開できます。

---

## 主な機能 (Features)

1. **OMP 会話の自動・手動インポート (`/omp import`)**
   - プラグイン起動時にバックグラウンドで OMP 会話の差分同期を自動実行します。
   - スラッシュコマンド `/omp import`（または `/omp sync`）により、オンデマンドで OMP の会話を DSH セッションストアへ取り込めます。

2. **OMP セッションの一覧表示 (`/omp list`)**
   - 直近の OMP セッション履歴（セッションID、タイトル、メッセージ件数、作業ディレクトリ、更新日時）を表形式で一覧表示します。

3. **連携ステータスの確認 (`/omp status`)**
   - OMP セッション保存先パスの検出状態や、インポート対象の会話件数などを確認できます。

---

## コマンド一覧 (Commands)

TUI 上のプロンプトで以下のスラッシュコマンドを実行できます。

| コマンド | 説明 |
| :--- | :--- |
| `/omp` または `/omp list` | OMP の最新会話一覧を表示します（直近20件）。 |
| `/omp import` | OMP の会話をすべて DSH / dst にインポートします。 |
| `/omp status` | OMP 会話ディレクトリの検出状況と統計情報を確認します。 |
| `/omp help` | コマンドのヘルプ情報を表示します。 |

> **セッションの再開**:
> インポートが完了した会話は、dsh-TUI 標準の `/resume` コマンドから対象の作業ディレクトリを選択して通常通り再開・継続できます。

---

## インストールと設定 (Installation & Configuration)

### 1. インストール

npm パッケージとして利用する場合:

```bash
npm install -g dsh-plugin-omp
```

またはリポジトリをローカルにクローンして利用する場合:

```bash
git clone https://github.com/puyokura/dsh-plugin-omp.git
```

### 2. Cordis 設定 (`cordis.patch.yml` または Cordis 設定ファイル)

Cordis プラグイン設定に `dsh-plugin-omp` を追加します。

#### パッケージとして読み込む場合

```yaml
plugins:
  dsh-plugin-omp: {}
```

#### ローカルディレクトリから読み込む場合

```yaml
plugins:
  dsh-plugin-omp:
    path: /path/to/dsh-plugin-omp
```

Windows 環境のパス指定例:

```yaml
plugins:
  dsh-plugin-omp:
    path: D:/workspace/dsh-plugins/dsh-plugin-omp
```

---

## 仕様詳細

- **OMP セッション走査先**:
  - Windows: `%USERPROFILE%\.omp\agent\sessions`
  - Linux / macOS: `~/.omp/agent/sessions`
- **オンボーディング設定先**:
  - `~/.dsh-tui/onboarding.json`
- **エントリーポイント**:
  - `index.mjs` (ES Module)
  - Cordis inject: `commands`

---

## English Summary

`dsh-plugin-omp` is a Cordis plugin for DeepSeek Harness (dsh-TUI / dst).

### Features
- **Welcome Screen Suppression**: Automatically suppresses the initial onboarding wizard in dsh-TUI.
- **OMP Conversation Migration**: Bridges conversation logs from `~/.omp/agent/sessions` into the DSH session store via `/omp import` and silent startup background sync.
- **Session Browsing**: View recent OMP conversations via `/omp list` and check path/import status via `/omp status`.
- **Seamless Resume**: Resume imported conversations natively using the dsh-TUI `/resume` command.

### Usage
- `/omp list` - Display recent OMP conversation logs.
- `/omp import` - Import all OMP sessions into DSH.
- `/omp status` - Check OMP directory path and session statistics.
- `/omp help` - Show help message.

---

## ライセンス (License)

MIT License (c) 2026 puyokura. 詳細は [LICENSE](./LICENSE) ファイルを参照してください。
