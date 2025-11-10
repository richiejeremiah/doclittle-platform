/**
 * Database Backup Script
 * Creates a backup of the SQLite database
 * 
 * Usage:
 *   node scripts/backup-database.js
 *   node scripts/backup-database.js --auto  # For cron jobs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, '..', 'middleware.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Create backups directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `middleware-backup-${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    try {
        // Check if database exists
        if (!fs.existsSync(DB_PATH)) {
            console.error('❌ Database file not found:', DB_PATH);
            process.exit(1);
        }

        // Copy database file
        fs.copyFileSync(DB_PATH, backupPath);

        // Get file size
        const stats = fs.statSync(backupPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log('✅ Database backup created successfully!');
        console.log(`   File: ${backupFileName}`);
        console.log(`   Size: ${fileSizeMB} MB`);
        console.log(`   Path: ${backupPath}`);

        // Clean up old backups (keep last 30 days)
        if (process.argv.includes('--auto')) {
            cleanupOldBackups();
        }

        return backupPath;

    } catch (error) {
        console.error('❌ Backup failed:', error.message);
        process.exit(1);
    }
}

function cleanupOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

        let deletedCount = 0;

        files.forEach(file => {
            if (file.startsWith('middleware-backup-') && file.endsWith('.db')) {
                const filePath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filePath);
                
                if (stats.mtimeMs < thirtyDaysAgo) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
        });

        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old backup(s)`);
        }

    } catch (error) {
        console.warn('⚠️  Error cleaning up old backups:', error.message);
    }
}

// Run backup
if (require.main === module) {
    createBackup();
}

module.exports = { createBackup };

