require('dotenv').config();
const path = require('path');

const db = require('../database');
const { parseCptFile, CPT_TEXT_PATH } = require('../scripts/import-cpt-codes');
const { runCodingPipeline, classifyEncounter } = require('../services/coding-orchestrator');

async function ensureCptImported() {
  const count = db.db.prepare('SELECT COUNT(*) as total FROM cpt_codes').get();
  if (count.total > 0) {
    console.log(`📚 CPT codes already loaded (${count.total.toLocaleString()} entries)`);
    return;
  }

  console.log('📥 Importing CPT codes...');
  const codes = parseCptFile(CPT_TEXT_PATH);
  db.bulkUpsertCptCodes(codes);
  console.log(`✅ Imported ${codes.length.toLocaleString()} CPT codes`);
}

const sampleEncounters = [
  // 7 simple cases
  {
    id: 'S1',
    appointmentType: 'Outpatient psychotherapy',
    durationMinutes: 50,
    clinicalNote: 'Patient reports anxiety and muscle tension; CBT session focused on relaxation techniques.',
    patientContext: { age: 29, gender: 'Female' },
    expectedBand: 'SIMPLE'
  },
  {
    id: 'S2',
    appointmentType: 'Outpatient psychotherapy',
    durationMinutes: 30,
    clinicalNote: 'Follow-up for depressive symptoms, short psychotherapy session covering coping skills.',
    patientContext: { age: 42, gender: 'Male' },
    expectedBand: 'SIMPLE'
  },
  {
    id: 'S3',
    appointmentType: 'Psychiatric medication management',
    durationMinutes: 25,
    clinicalNote: 'Medication review for PTSD, brief supportive therapy and med adjustments.',
    patientContext: { age: 35 },
    expectedBand: 'SIMPLE'
  },
  {
    id: 'S4',
    appointmentType: 'Outpatient psychotherapy',
    durationMinutes: 50,
    clinicalNote: `Patient describes generalized anxiety symptoms, practiced CBT.
Focus on progressive muscle relaxation and journaling.`,
    patientContext: { age: 31 },
    expectedBand: 'SIMPLE'
  },
  {
    id: 'S5',
    appointmentType: 'Outpatient psychotherapy',
    durationMinutes: 50,
    clinicalNote: 'GAD follow-up session with CBT, no new issues, reviewed anxiety log.',
    patientContext: { age: 47 },
    expectedBand: 'SIMPLE'
  },
  {
    id: 'S6',
    appointmentType: 'Outpatient psychotherapy',
    durationMinutes: 30,
    clinicalNote: 'Depression follow-up, focused on behavioral activation, short psychotherapy.',
    patientContext: { age: 58 },
    expectedBand: 'SIMPLE'
  },
  {
    id: 'S7',
    appointmentType: 'Psychiatric medication management',
    durationMinutes: 25,
    clinicalNote: 'Medication check-in for PTSD, reviewed side effects and coping strategies.',
    patientContext: { age: 26 },
    expectedBand: 'SIMPLE'
  },
  // 2 moderate cases
  {
    id: 'M1',
    appointmentType: 'Behavioral health follow-up',
    durationMinutes: 40,
    clinicalNote: 'Patient reports stress and occasional insomnia; session focused on mindfulness techniques and coping skills.',
    patientContext: { age: 38 },
    expectedBand: 'MODERATE'
  },
  {
    id: 'M2',
    appointmentType: 'Behavioral health follow-up',
    durationMinutes: 35,
    clinicalNote: 'Discussed anxiety triggers related to work; provided breathing exercises and journaling homework.',
    patientContext: { age: 33 },
    expectedBand: 'MODERATE'
  },
  // 1 complex case
  {
    id: 'C1',
    appointmentType: 'Outpatient psychotherapy',
    durationMinutes: 55,
    clinicalNote: `Patient: 45-year-old female with history of recurrent major depressive disorder and generalized anxiety disorder.
Presents with increased worry, insomnia, and difficulty concentrating. CBT session focused on cognitive restructuring, grounding techniques, and safety planning.
Reviewed medication adherence and plan to coordinate with psychiatrist.`,
    patientContext: { age: 45, gender: 'Female', location: 'Telehealth' },
    expectedBand: 'COMPLEX'
  }
];

async function run() {
  await ensureCptImported();

  const results = [];

  for (const encounter of sampleEncounters) {
    const classification = classifyEncounter(encounter);
    console.log(`\n🔎 Encounter ${encounter.id}: classified as ${classification.band} (expected ${encounter.expectedBand})`);

    const output = await runCodingPipeline(encounter);
    results.push({ id: encounter.id, expectedBand: encounter.expectedBand, band: output.band, output });

    console.log('ICD-10:', output.icd10);
    console.log('CPT:', output.cpt);
    console.log('Rationale:', output.rationale);
  }

  const summary = results.reduce((acc, item) => {
    acc.total += 1;
    acc.byBand[item.band] = (acc.byBand[item.band] || 0) + 1;
    acc.matches += item.band === item.expectedBand ? 1 : 0;
    return acc;
  }, { total: 0, matches: 0, byBand: {} });

  console.log('\n=== Summary ===');
  console.log('Band distribution:', summary.byBand);
  console.log('Accuracy vs expected:', `${summary.matches}/${summary.total}`);
}

run().catch(err => {
  console.error('❌ Bucket test failed:', err);
  process.exit(1);
});
