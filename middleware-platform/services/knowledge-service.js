const fs = require('fs');
const path = require('path');

const db = require('../database');

const ICD_REFERENCE_PATH = path.resolve(__dirname, '../../Knowledge/icd10_reference.json');
const SIMPLE_RULES_PATH = path.resolve(__dirname, '../../Knowledge/rules/simple-coding-rules.json');
let icdCache = [];
let simpleRules = [];

try {
  if (fs.existsSync(ICD_REFERENCE_PATH)) {
    const raw = fs.readFileSync(ICD_REFERENCE_PATH, 'utf8');
    icdCache = JSON.parse(raw);
  }
} catch (error) {
  console.warn('⚠️  Failed to load ICD reference list:', error.message);
  icdCache = [];
}

try {
  if (fs.existsSync(SIMPLE_RULES_PATH)) {
    const raw = fs.readFileSync(SIMPLE_RULES_PATH, 'utf8');
    simpleRules = JSON.parse(raw);
  }
} catch (error) {
  console.warn('⚠️  Failed to load simple coding rules:', error.message);
  simpleRules = [];
}

const DEFAULT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'patient', 'presents', 'into',
  'about', 'over', 'after', 'before', 'because', 'during', 'without', 'within', 'there', 'their',
  'they', 'them', 'were', 'when', 'will', 'would', 'could', 'should', 'does', 'doing', 'been', 'being',
  'also', 'very', 'much', 'than', 'then', 'into', 'onto', 'onto', 'due', 'while', 'where', 'which',
  'however', 'makes', 'make', 'made', 'take', 'takes', 'taken', 'per', 'day', 'week', 'hour', 'minute',
  'session', 'sessions', 'visit', 'visits', 'plan', 'follow', 'up', 'followup', 'reported', 'reports',
  'history', 'chief', 'complaint', 'assessment', 'plan', 'note', 'denies', 'states', 'reports'
]);

function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function extractKeywords(note, limit = 12) {
  if (!note || typeof note !== 'string') return [];
  const tokens = tokenize(note);
  const freq = new Map();

  for (const token of tokens) {
    if (token.length < 4) continue;
    if (DEFAULT_STOPWORDS.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function getCandidateCptCodes(note, options = {}) {
  const limit = options.limit || 12;
  const keywords = extractKeywords(note, 20);
  const results = new Map();

  if (keywords.length === 0) {
    return db.searchCptCodes('', limit);
  }

  for (const keyword of keywords) {
    const matches = db.searchCptCodes(keyword, 5);
    for (const item of matches) {
      if (!results.has(item.code)) {
        results.set(item.code, {
          code: item.code,
          description: item.description,
          category: item.category,
          subcategory: item.subcategory,
          matchedKeywords: new Set([keyword])
        });
      } else {
        results.get(item.code).matchedKeywords.add(keyword);
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.matchedKeywords.size - a.matchedKeywords.size)
    .slice(0, limit)
    .map(item => ({
      code: item.code,
      description: item.description,
      category: item.category,
      subcategory: item.subcategory,
      matched_keywords: Array.from(item.matchedKeywords)
    }));
}

function getReferenceIcdCodes(limit = 15) {
  if (!Array.isArray(icdCache) || icdCache.length === 0) {
    return [];
  }
  return icdCache.slice(0, limit);
}

function matchSimpleRule({ appointmentType, durationMinutes, clinicalNote }) {
  if (!Array.isArray(simpleRules) || simpleRules.length === 0) return null;
  const noteLower = (clinicalNote || '').toLowerCase();
  for (const rule of simpleRules) {
    const match = rule.match || {};
    if (match.appointment_type && appointmentType !== match.appointment_type) continue;
    if (match.duration_minutes && Number(durationMinutes) !== Number(match.duration_minutes)) continue;

    let diagnosisOk = true;
    if (Array.isArray(match.diagnosis_keywords) && match.diagnosis_keywords.length > 0) {
      diagnosisOk = match.diagnosis_keywords.some(keyword => noteLower.includes(keyword.toLowerCase()));
    }

    let procedureOk = true;
    if (Array.isArray(match.procedure_keywords) && match.procedure_keywords.length > 0) {
      procedureOk = match.procedure_keywords.some(keyword => noteLower.includes(keyword.toLowerCase()));
    }

    if (diagnosisOk && procedureOk) {
      return {
        id: rule.id,
        icd10: rule.icd10 || [],
        cpt: rule.cpt || [],
        rationale: rule.rationale || ''
      };
    }
  }
  return null;
}

module.exports = {
  getCandidateCptCodes,
  getReferenceIcdCodes,
  extractKeywords,
  matchSimpleRule
};
