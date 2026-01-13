#!/usr/bin/env bash
set -euo pipefail

# AJSON mini JARVIS - Backup SOP (Fail-Closed)
# Saves a commit-SHA pinned ZIP of the repo to:
#   /Users/Backups/ajson-mini-jarvis/
#
# Outputs:
#   YYYYMMDD-HHMMSS_<sha7>_main.zip
#   ...zip.manifest.tsv
#   ...zip.sha256
#   latest.zip  (symlink to newest)
#   latest.txt  (full path to newest zip)

REPO="office-n/ajson-mini-jarvis"
BRANCH="main"
OUTDIR="/Users/Backups/ajson-mini-jarvis"

TS="$(date '+%Y%m%d-%H%M%S')"
mkdir -p "$OUTDIR"

# Commit SHA (full) + sha7
SHA="$(gh api "/repos/${REPO}/commits/${BRANCH}" --jq .sha)"
SHA7="${SHA:0:7}"

ZIP="${OUTDIR}/${TS}_${SHA7}_${BRANCH}.zip"
MANIFEST="${ZIP}.manifest.tsv"
SUM="${ZIP}.sha256"

# 1) ZIP freeze (codeload is the source of truth)
curl -L -o "$ZIP" "https://codeload.github.com/${REPO}/zip/${SHA}" || { echo "NG: download failed"; exit 1; }

# 2) Fail-Closed validation
file "$ZIP" | grep -q "Zip archive data" || { echo "NG: not a zip"; exit 1; }
test -s "$ZIP" || { echo "NG: zip empty"; exit 1; }

# 3) Integrity
shasum -a 256 "$ZIP" > "$SUM" || { echo "NG: sha256 failed"; exit 1; }

# 4) Manifest (tree listing)
TREE="$(gh api "/repos/${REPO}/git/commits/${SHA}" --jq .tree.sha)"
gh api "/repos/${REPO}/git/trees/${TREE}?recursive=1"   --jq '.tree[] | [.type,.path,(.size // 0)] | @tsv' > "$MANIFEST" || { echo "NG: manifest failed"; exit 1; }

# 5) Update latest pointers
( cd "$OUTDIR" && ln -sf "$(basename "$ZIP")" latest.zip )
echo "$ZIP" > "${OUTDIR}/latest.txt"

echo "OK: $ZIP"
echo "OK: $MANIFEST"
echo "OK: $SUM"
echo "OK: ${OUTDIR}/latest.zip"
echo "OK: ${OUTDIR}/latest.txt"
