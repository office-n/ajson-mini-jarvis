# AJSON mini JARVIS Factory
- Constitution: `docs/CONSTITUTION.md` (v1.1)
- SHP (Session Handoff Protocol): `docs/SHP.md` (v1)
- Console UI: `console/` (Boss UI / V1 Mock)
- CI: `.github/workflows/ci.yml` (ubuntu-latest)

## Backup (Local Freeze)

Run:

```bash
bash scripts/backup.sh
```

Artifacts are saved to:

- `/Users/Backups/ajson-mini-jarvis/latest.zip`
- `/Users/Backups/ajson-mini-jarvis/latest.txt`
- Timestamped ZIP + manifest + sha256
