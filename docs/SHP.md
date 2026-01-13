# SHP v1 (Session Handoff Protocol)

## Boss Command (Snapshot)
- Short: `SNAPSHOT`

## Boss Command (Load in new session)
`JARVIS、以下のSESSION SNAPSHOT（Context Pack）をロードして作業を再開せよ。
ルール：推測禁止。不明は不明。まず「ロード完了」を宣言し、(1)確定事項 (2)未確定事項 (3)次の一手 を提示せよ。
---（ここに全文を貼る）`

## Output Must Include
- (A) JSON
- (B) Verbatim (script/constitution/numbers) with markers
- (C) Checklist
- (D) This SHP itself

## Backup SOP（恒久 / Fail-Closed）

保存先: `/Users/Backups/ajson-mini-jarvis/`

出力:
- `latest.zip`（常に最新版へのシンボリックリンク）
- `latest.txt`（最新版zipのフルパス）
- `YYYYMMDD-HHMMSS_<sha7>_main.zip`（凍結zip）
- `...zip.manifest.tsv`（ファイル一覧）
- `...zip.sha256`（改ざん検知）

方針:
- GitHub API `zipball` は環境差で不安定になり得るため不採用。
- `codeload.github.com` を唯一の正（Source of Truth）とする。
- Fail-Closed: `file` 判定と `test -s` を必須とする。

実行（ボスの指示: `backup`）:
- リポジトリに同梱された `scripts/backup.sh` を実行するだけで良い。

```bash
bash scripts/backup.sh
```
