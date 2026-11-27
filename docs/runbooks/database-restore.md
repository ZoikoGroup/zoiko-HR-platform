# Restoring the database from a pre-migration backup

Every deploy that runs a migration first writes a backup on the production server (M1-02,
`backend/scripts/predeploy_backup.py`). Deploys with no pending migration don't need a backup and don't write one.

- **Where:** `~/zoiko-hr-backups/` for the deploy user on the VM (or `$BACKUP_DIR`), one file per deploy:
  `<UTC time>_<commit sha>.dump`, `pg_dump` custom format.
- **How long:** 7 days (`KEEP_DAYS`).
- **Who can read it:** the deploy user only (the folder is `700` and each file `600`). It contains personal data:
  never copy it to a laptop or a chat.

## Before you restore

A restore **replaces** everything written since the backup: leave requests, sign-ins, edits. Restore only when a
migration damaged data and a forward fix isn't possible. Rolling the code back alone (`git` / M1-04) doesn't need
a restore.

## Rehearse on a copy first (do this once now, and before any real restore)

```bash
ssh <deploy user>@<vm>
ls -lh ~/zoiko-hr-backups/                      # pick the file for the deploy you want to undo
F=~/zoiko-hr-backups/<file>.dump

pg_restore --list "$F" | head                   # readable?

# a scratch database on the same server, never the live one
createdb -h <db host> -U <admin user> zoiko_hr_restore_test
pg_restore -h <db host> -U <admin user> -d zoiko_hr_restore_test --no-owner --no-privileges "$F"
psql -h <db host> -U <admin user> -d zoiko_hr_restore_test -c "select version_num from alembic_version;"
psql -h <db host> -U <admin user> -d zoiko_hr_restore_test -c "select count(*) from employees;"
dropdb -h <db host> -U <admin user> zoiko_hr_restore_test
```

Write down how long the restore took and the date you rehearsed it.

## Real restore

1. Stop writes: `sudo systemctl stop zoiko-hr-backend`.
2. Put the code back to the commit **before** the bad migration (its sha is in the previous Deploy run's log,
   `Deploying <sha>`): `cd /var/www/zoiko-hr-backend/app && git checkout <previous sha>`.
3. Restore into a **new** database, check it (the rehearsal's `psql` checks), then point `HR_DATABASE_URL` at it,
   or rename the databases. Never `pg_restore --clean` straight onto the live database.
4. `sudo systemctl start zoiko-hr-backend` and check `curl -fsS http://127.0.0.1:<port>/super-admin/health`.
5. Put `main` back in step: revert the bad migration in a PR, so the next deploy doesn't run it again.

## Manual backup at any time

```bash
cd /var/www/zoiko-hr-backend/app/backend && source venv/bin/activate
python scripts/predeploy_backup.py --force --label manual
```
