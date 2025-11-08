/**
 * Add Sample EHR Data for Testing UI Display
 * 
 * This script creates sample Epic EHR data so you can see what's being pulled
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('middleware.db');

console.log('📊 Adding sample Epic EHR data...\n');

// Get first FHIR patient
const fhirPatients = db.prepare('SELECT * FROM fhir_patients LIMIT 3').all();

if (fhirPatients.length === 0) {
  console.error('❌ No FHIR patients found. Please create patients first.');
  process.exit(1);
}

console.log(`Found ${fhirPatients.length} FHIR patient(s)\n`);

fhirPatients.forEach((patient, idx) => {
  const patientId = patient.resource_id;
  const patientName = patient.name || `Patient ${idx + 1}`;
  
  console.log(`📋 Adding EHR data for: ${patientName} (${patientId})`);

  // Create EHR encounter
  const encounterId = uuidv4();
  const encounterDate = new Date(Date.now() - (idx * 7 * 24 * 60 * 60 * 1000)); // Different dates
  
  db.prepare(`
    INSERT INTO ehr_encounters 
    (id, fhir_encounter_id, patient_id, appointment_id, provider_id, 
     start_time, end_time, status, raw_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    encounterId,
    `epic-encounter-${encounterId}`,
    patientId,
    null, // No appointment link for now
    'default-provider',
    encounterDate.toISOString(),
    new Date(encounterDate.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour later
    'finished',
    JSON.stringify({
      resourceType: 'Encounter',
      status: 'finished',
      subject: { reference: `Patient/${patientId}` }
    })
  );

  // Add conditions (ICD-10 codes) - mental health diagnoses
  const conditions = [
    { code: 'F41.1', description: 'Generalized anxiety disorder', is_primary: true },
    { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified', is_primary: false }
  ];

  conditions.forEach((condition, condIdx) => {
    db.prepare(`
      INSERT INTO ehr_conditions 
      (id, ehr_encounter_id, icd10_code, description, is_primary, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      encounterId,
      condition.code,
      condition.description,
      condition.is_primary ? 1 : 0,
      JSON.stringify({
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: condition.code }] }
      })
    );
  });

  console.log(`  ✅ Added ${conditions.length} conditions (ICD-10 codes)`);

  // Add procedures (CPT codes)
  const procedures = [
    { code: '90837', description: 'Psychotherapy, 60 minutes with patient', modifier: null },
    { code: '90834', description: 'Psychotherapy, 45 minutes with patient', modifier: null }
  ];

  procedures.forEach((procedure) => {
    db.prepare(`
      INSERT INTO ehr_procedures 
      (id, ehr_encounter_id, cpt_code, modifier, description, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      encounterId,
      procedure.code,
      procedure.modifier,
      procedure.description,
      JSON.stringify({
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: procedure.code }] }
      })
    );
  });

  console.log(`  ✅ Added ${procedures.length} procedures (CPT codes)`);

  // Add observations (vitals/notes)
  const observations = [
    { type: 'Blood Pressure', value: '120/80', unit: 'mmHg' },
    { type: 'Heart Rate', value: '72', unit: 'bpm' },
    { type: 'Temperature', value: '98.6', unit: '°F' },
    { type: 'Clinical Note', value: 'Patient reports improved mood and decreased anxiety symptoms. CBT techniques discussed. Medication compliance good.' }
  ];

  observations.forEach((observation) => {
    db.prepare(`
      INSERT INTO ehr_observations 
      (id, ehr_encounter_id, type, value, unit, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      encounterId,
      observation.type,
      observation.value,
      observation.unit,
      JSON.stringify({
        code: { text: observation.type },
        valueString: observation.value,
        valueQuantity: observation.unit ? { value: observation.value, unit: observation.unit } : null
      })
    );
  });

  console.log(`  ✅ Added ${observations.length} observations (vitals/notes)`);
  console.log(`  ✅ Created encounter: ${encounterId}\n`);
});

console.log('✅ Sample EHR data added successfully!');
console.log('\n📋 Summary:');
const totalEncounters = db.prepare('SELECT COUNT(*) as count FROM ehr_encounters').get();
const totalConditions = db.prepare('SELECT COUNT(*) as count FROM ehr_conditions').get();
const totalProcedures = db.prepare('SELECT COUNT(*) as count FROM ehr_procedures').get();
const totalObservations = db.prepare('SELECT COUNT(*) as count FROM ehr_observations').get();

console.log(`  - Encounters: ${totalEncounters.count}`);
console.log(`  - Conditions (ICD-10): ${totalConditions.count}`);
console.log(`  - Procedures (CPT): ${totalProcedures.count}`);
console.log(`  - Observations: ${totalObservations.count}`);
console.log('\n🔄 Now refresh your browser to see Epic EHR data in the Clients tab!');

