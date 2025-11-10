# Database Backup Strategy

## Overview

The platform includes automated database backup functionality to protect against data loss.

## Manual Backup

To create a backup manually:

```bash
cd middleware-platform
npm run backup
```

Or directly:

```bash
node scripts/backup-database.js
```

This will create a timestamped backup file in the `backups/` directory:
- Format: `middleware-backup-YYYY-MM-DDTHH-MM-SS-sssZ.db`
- Location: `middleware-platform/backups/`

## Automated Backups

### Using Cron (Linux/macOS)

Set up a daily backup at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line:
0 2 * * * cd /path/to/middleware-platform && node scripts/backup-database.js --auto
```

The `--auto` flag:
- Automatically cleans up backups older than 30 days
- Runs silently (no interactive prompts)

### Using Systemd Timer (Linux)

Create a systemd service file:

```ini
# /etc/systemd/system/middleware-backup.service
[Unit]
Description=Middleware Platform Database Backup
After=network.target

[Service]
Type=oneshot
User=your-user
WorkingDirectory=/path/to/middleware-platform
ExecStart=/usr/bin/node scripts/backup-database.js --auto
```

Create a timer file:

```ini
# /etc/systemd/system/middleware-backup.timer
[Unit]
Description=Daily Database Backup Timer
Requires=middleware-backup.service

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl enable middleware-backup.timer
sudo systemctl start middleware-backup.timer
```

### Using Railway Scheduled Tasks

If deploying on Railway, you can use Railway's cron jobs:

1. Go to your Railway project
2. Add a new service
3. Use the Dockerfile or Nixpacks
4. Set the command to: `node scripts/backup-database.js --auto`
5. Configure a cron schedule: `0 2 * * *` (daily at 2 AM)

### Using GitHub Actions

You can also set up automated backups via GitHub Actions:

```yaml
# .github/workflows/backup.yml
name: Daily Database Backup

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - name: Create backup
        run: |
          cd middleware-platform
          npm install
          node scripts/backup-database.js --auto
      - name: Upload backup artifact
        uses: actions/upload-artifact@v4
        with:
          name: database-backup
          path: middleware-platform/backups/*.db
          retention-days: 30
```

## Backup Retention

- **Manual backups**: Kept indefinitely (you manage them)
- **Automated backups** (`--auto` flag): Automatically deleted after 30 days

## Backup Storage

### Local Storage
- Backups are stored in `middleware-platform/backups/`
- Add this directory to `.gitignore` (already included)

### Cloud Storage (Recommended for Production)

For production, consider uploading backups to cloud storage:

1. **AWS S3**:
```bash
# After backup, upload to S3
aws s3 cp backups/middleware-backup-*.db s3://your-bucket/backups/
```

2. **Google Cloud Storage**:
```bash
gsutil cp backups/middleware-backup-*.db gs://your-bucket/backups/
```

3. **Azure Blob Storage**:
```bash
az storage blob upload --container-name backups --file backups/middleware-backup-*.db
```

### Enhanced Backup Script (Future)

You can extend the backup script to:
- Upload to cloud storage automatically
- Encrypt backups before storage
- Send notifications on backup success/failure
- Compress backups (SQLite databases compress well)

## Restoring from Backup

To restore a backup:

```bash
# Stop the application
# Copy backup over database
cp backups/middleware-backup-YYYY-MM-DDTHH-MM-SS-sssZ.db middleware.db

# Restart the application
```

**⚠️ Warning**: Restoring will overwrite the current database. Make a backup first!

## Monitoring

Monitor backup success:

1. **Check backup directory**:
```bash
ls -lh middleware-platform/backups/
```

2. **Check backup age**:
```bash
find middleware-platform/backups/ -name "*.db" -mtime -1
```

3. **Set up alerts** (if using cron/systemd):
   - Email on backup failure
   - Log to monitoring system
   - Check backup file size (should be > 0)

## Best Practices

1. **Test restores regularly**: Periodically test restoring from backups
2. **Multiple locations**: Store backups in multiple locations (local + cloud)
3. **Encryption**: Encrypt backups containing sensitive data
4. **Monitoring**: Set up alerts for backup failures
5. **Documentation**: Document your backup and restore procedures
6. **Retention policy**: Define how long to keep backups based on your needs

## Troubleshooting

### Backup fails with "Database file not found"
- Check that `middleware.db` exists in `middleware-platform/`
- Verify the database path in the script

### Backups directory not created
- Check file permissions
- Ensure the script has write access to the parent directory

### Old backups not being cleaned up
- Verify the `--auto` flag is being used
- Check file modification times
- Ensure the cleanup function has proper error handling

