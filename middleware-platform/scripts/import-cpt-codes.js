#!/usr/bin/env node
/**
 * Import CPT codes from the CMS addendum text file into the local SQLite knowledge base.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = require('../database');

const CPT_TEXT_PATH = path.resolve(__dirname, '../../Knowledge/CPT/2025_DHS_Code_List_Addendum_11_26_2024.txt');

function isHeading(line) {
  if (!line) return false;
  const cleaned = line.replace(/[^A-Z0-9 &()\/-]/g, '').trim();
  if (!cleaned) return false;
  if (cleaned.length < 5) return false;
  if (/[0-9]/.test(cleaned) && !/^[0-9]{4,}/.test(cleaned)) return false;
  return cleaned === cleaned.toUpperCase();
}

function normalizeCode(code) {
  if (!code) return null;
  const cleaned = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!cleaned) return null;
  if (!/^[A-Z0-9]{3,7}$/.test(cleaned)) return null;
  return cleaned;
}

function parseCptFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CPT file not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  let currentCategory = 'Uncategorized';
  const codes = [];
  const seen = new Set();

  for (let rawLine of lines) {
    if (!rawLine) continue;
    let line = rawLine.replace(/\u00A0/g, ' ').trim();
    if (!line) continue;

    if (line.startsWith('"')) {
      line = line.replace(/^"|"$/g, '').trim();
    }

    if (isHeading(line) && !/^INCLUDE|^EXCLUDE/.test(line)) {
      currentCategory = line;
      continue;
    }

    if (/^(INCLUDE|EXCLUDE)/i.test(line)) {
      continue;
    }

    const parts = rawLine.split(/\t+/).map(p => p.trim()).filter(Boolean);
    let code = null;
    let description = null;

    if (parts.length >= 2) {
      code = normalizeCode(parts[0]);
      description = parts.slice(1).join(' ').replace(/"/g, '').trim();
    } else {
      const match = line.match(/^([0-9A-Za-z]{4,7})\s+(.+)$/);
      if (match) {
        code = normalizeCode(match[1]);
        description = match[2].replace(/"/g, '').trim();
      }
    }

    if (!code || !description) {
      continue;
    }

    if (seen.has(code)) {
      continue;
    }

    codes.push({
      code,
      description,
      category: currentCategory,
      subcategory: null,
      is_new: /\bNEW\b/i.test(description)
    });

    seen.add(code);
  }

  return codes;
}

function main() {
  try {
    const codes = parseCptFile(CPT_TEXT_PATH);
    db.bulkUpsertCptCodes(codes);
    console.log(`✅ Imported ${codes.length} CPT codes from ${path.basename(CPT_TEXT_PATH)}`);
  } catch (error) {
    console.error('❌ Failed to import CPT codes:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCptFile,
  CPT_TEXT_PATH
};
