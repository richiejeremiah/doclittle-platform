require('dotenv').config();
const path = require('path');
const fs = require('fs');

const db = require('../database');
const { parseCptFile, CPT_TEXT_PATH } = require('../scripts/import-cpt-codes');
const { generateCodingSuggestion } = require('../services/medical-coding-service');

async function ensureCptImported() {
  const count = db.db.prepare('SELECT COUNT(*) as total FROM cpt_codes').get();
  if (count.total > 0) {
    console.log(`📚 CPT codes already loaded (${count.total.toLocaleString()} entries)`);
    return;
  }

  console.log('📥 Importing CPT codes from text addendum...');
  const codes = parseCptFile(CPT_TEXT_PATH);
  db.bulkUpsertCptCodes(codes);
  console.log(`✅ Imported ${codes.length.toLocaleString()} CPT codes`);
}

async function runTest() {
  try {
    await ensureCptImported();

    const sampleNote = `
Patient Name: Jamie Tester
DOB: 1990-05-12
Encounter Date: 2025-11-10

Subjective:
Jamie reports persistent anxiety for the past 6 months with occasional panic episodes.
She describes difficulty concentrating, insomnia, and muscle tension. No suicidal ideation.

Objective:
Mental status exam significant for anxious mood, appropriate affect.
No evidence of psychosis. Vitals stable.

Assessment:
Generalized anxiety disorder (GAD). No comorbid depressive disorder identified today.

Plan:
50-minute individual psychotherapy session (CBT focus) to address anxiety management techniques.
Reviewed deep breathing, progressive muscle relaxation, and journaling homework.
Follow-up scheduled in two weeks.`.trim();

    const encounterType = 'Outpatient psychotherapy';
    const patientContext = {
      age: 35,
      gender: 'Female',
      location: 'DocLittle Clinic - Telehealth'
    };

    console.log('\n🧠 Generating coding suggestion...');
    const result = await generateCodingSuggestion({
      clinicalNote: sampleNote,
      encounterType,
      patientContext
    });

    console.log('\n=== Suggested ICD-10 Codes ===');
    if (result.icd10.length === 0) {
      console.log('  (none returned)');
    } else {
      result.icd10.forEach(item => {
        console.log(`  - ${item.code}: ${item.description} (confidence ${item.confidence ?? 'n/a'})`);
      });
    }

    console.log('\n=== Suggested CPT Codes ===');
    if (result.cpt.length === 0) {
      console.log('  (none returned)');
    } else {
      result.cpt.forEach(item => {
        console.log(`  - ${item.code}: ${item.description} (confidence ${item.confidence ?? 'n/a'})`);
      });
    }

    console.log('\n=== Rationale ===');
    console.log(result.rationale || '(none provided)');

    console.log('\n=== Prompt Context (debug) ===');
    console.log('Top CPT candidates used:', result.promptContext.cptCandidates.slice(0, 5));
    console.log('ICD reference sample:', result.promptContext.icdReference.slice(0, 5));

    console.log('\n✅ Medical coding assistant test complete.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
