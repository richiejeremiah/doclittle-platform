/**
 * Create Test EHR Data for Medical Coding Scenario
 * 
 * This creates realistic EHR data with clinical notes that will trigger
 * medical coding when we integrate it. The data will show in Clients tab.
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('middleware.db');

console.log('🏥 Creating Medical Coding Test Data...\n');
console.log('='.repeat(60));

// Get existing FHIR patients
const fhirPatients = db.prepare('SELECT * FROM fhir_patients LIMIT 5').all();

if (fhirPatients.length === 0) {
  console.error('❌ No FHIR patients found. Please create patients first.');
  console.log('💡 Patients are created when appointments are booked via voice agent.');
  process.exit(1);
}

console.log(`✅ Found ${fhirPatients.length} FHIR patient(s)\n`);

// Test scenarios for medical coding
const testScenarios = [
  {
    name: 'Simple Case - Anxiety with Psychotherapy',
    clinicalNote: `Patient presents with generalized anxiety disorder. Reports increased worry and tension over the past month. 
CBT session conducted focusing on cognitive restructuring and relaxation techniques. Patient engaged well.
50-minute psychotherapy session.`,
    conditions: [
      { code: 'F41.1', description: 'Generalized anxiety disorder', is_primary: true }
    ],
    procedures: [
      { code: '90837', description: 'Psychotherapy, 60 minutes with patient', modifier: null }
    ],
    observations: [
      { type: 'Clinical Note', value: 'Patient presents with generalized anxiety disorder. Reports increased worry and tension over the past month. CBT session conducted focusing on cognitive restructuring and relaxation techniques. Patient engaged well. 50-minute psychotherapy session.', unit: null },
      { type: 'GAD-7 Score', value: '12', unit: 'points' }
    ],
    shouldTriggerCoding: false // Has codes already
  },
  {
    name: 'Moderate Case - Depression Follow-up',
    clinicalNote: `Follow-up visit for major depressive disorder. Patient reports improved mood since last visit.
Continued medication management with sertraline 100mg daily. Brief supportive therapy session.
Discussing coping strategies and behavioral activation. Patient showing good progress.`,
    conditions: [], // Missing - should trigger coding
    procedures: [], // Missing - should trigger coding
    observations: [
      { type: 'Clinical Note', value: 'Follow-up visit for major depressive disorder. Patient reports improved mood since last visit. Continued medication management with sertraline 100mg daily. Brief supportive therapy session. Discussing coping strategies and behavioral activation. Patient showing good progress.', unit: null },
      { type: 'PHQ-9 Score', value: '8', unit: 'points' },
      { type: 'Blood Pressure', value: '118/75', unit: 'mmHg' }
    ],
    shouldTriggerCoding: true // Missing codes - will trigger medical coding
  },
  {
    name: 'Complex Case - PTSD with Multiple Symptoms',
    clinicalNote: `Patient presents with history of post-traumatic stress disorder following motor vehicle accident 6 months ago.
Reports persistent nightmares, hypervigilance, and avoidance behaviors. Also experiencing depressive symptoms.
Comprehensive psychiatric evaluation conducted. Discussed trauma-focused CBT and EMDR options.
Patient expresses readiness for trauma-focused therapy. Medication review: continuing sertraline, adding prazosin for nightmares.
Complex case requiring coordinated treatment approach.`,
    conditions: [], // Missing - should trigger coding
    procedures: [], // Missing - should trigger coding
    observations: [
      { type: 'Clinical Note', value: 'Patient presents with history of post-traumatic stress disorder following motor vehicle accident 6 months ago. Reports persistent nightmares, hypervigilance, and avoidance behaviors. Also experiencing depressive symptoms. Comprehensive psychiatric evaluation conducted. Discussed trauma-focused CBT and EMDR options. Patient expresses readiness for trauma-focused therapy. Medication review: continuing sertraline, adding prazosin for nightmares. Complex case requiring coordinated treatment approach.', unit: null },
      { type: 'PCL-5 Score', value: '42', unit: 'points' },
      { type: 'PHQ-9 Score', value: '14', unit: 'points' },
      { type: 'Heart Rate', value: '88', unit: 'bpm' }
    ],
    shouldTriggerCoding: true // Missing codes - will trigger COMPLEX medical coding
  },
  {
    name: 'Simple Case - Medication Management',
    clinicalNote: `Medication management visit for established patient with bipolar disorder.
Reviewing lithium levels and mood stability. Patient reports stable mood, no mania or depression.
Brief supportive therapy session. 30-minute visit.`,
    conditions: [
      { code: 'F31.9', description: 'Bipolar disorder, unspecified', is_primary: true }
    ],
    procedures: [
      { code: '99214', description: 'Office or outpatient visit, established patient, moderate complexity', modifier: null },
      { code: '90833', description: 'Psychotherapy, 30 minutes with patient when performed with an evaluation and management service', modifier: null }
    ],
    observations: [
      { type: 'Clinical Note', value: 'Medication management visit for established patient with bipolar disorder. Reviewing lithium levels and mood stability. Patient reports stable mood, no mania or depression. Brief supportive therapy session. 30-minute visit.', unit: null },
      { type: 'Lithium Level', value: '0.8', unit: 'mEq/L' }
    ],
    shouldTriggerCoding: false // Has codes already
  },
  {
    name: 'Moderate Case - Anxiety with Insomnia',
    clinicalNote: `New patient presenting with anxiety and sleep disturbances.
Reports difficulty falling asleep, waking frequently, and feeling tired during the day.
Anxiety symptoms include worry about work performance and financial stress.
Conducted initial assessment and discussed treatment options including CBT-I and medication.
Patient prefers non-pharmacological approach initially.`,
    conditions: [], // Missing - should trigger coding
    procedures: [], // Missing - should trigger coding
    observations: [
      { type: 'Clinical Note', value: 'New patient presenting with anxiety and sleep disturbances. Reports difficulty falling asleep, waking frequently, and feeling tired during the day. Anxiety symptoms include worry about work performance and financial stress. Conducted initial assessment and discussed treatment options including CBT-I and medication. Patient prefers non-pharmacological approach initially.', unit: null },
      { type: 'GAD-7 Score', value: '10', unit: 'points' },
      { type: 'ISI Score', value: '16', unit: 'points' }
    ],
    shouldTriggerCoding: true // Missing codes - will trigger medical coding
  }
];

// Create encounters for patients
let encounterCount = 0;
let conditionCount = 0;
let procedureCount = 0;
let observationCount = 0;

fhirPatients.forEach((patient, patientIdx) => {
  const patientId = patient.resource_id;
  const patientName = patient.name || `Patient ${patientIdx + 1}`;
  
  // Assign 1-2 scenarios per patient
  const scenariosPerPatient = patientIdx < testScenarios.length ? 1 : 2;
  const scenariosToUse = testScenarios.slice(
    (patientIdx * scenariosPerPatient) % testScenarios.length,
    ((patientIdx * scenariosPerPatient) % testScenarios.length) + scenariosPerPatient
  );

  scenariosToUse.forEach((scenario, scenarioIdx) => {
    console.log(`📋 Creating encounter for: ${patientName}`);
    console.log(`   Scenario: ${scenario.name}`);
    console.log(`   Will trigger coding: ${scenario.shouldTriggerCoding ? '✅ YES' : '❌ NO (has codes)'}`);

    // Create EHR encounter
    const encounterId = uuidv4();
    const encounterDate = new Date(Date.now() - ((patientIdx * 7 + scenarioIdx * 3) * 24 * 60 * 60 * 1000));
    
    db.prepare(`
      INSERT INTO ehr_encounters 
      (id, fhir_encounter_id, patient_id, appointment_id, provider_id, 
       start_time, end_time, status, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      encounterId,
      `epic-encounter-${encounterId}`,
      patientId,
      null,
      'default-provider',
      encounterDate.toISOString(),
      new Date(encounterDate.getTime() + 60 * 60 * 1000).toISOString(),
      'finished',
      JSON.stringify({
        resourceType: 'Encounter',
        status: 'finished',
        subject: { reference: `Patient/${patientId}` },
        text: {
          div: `<div>${scenario.clinicalNote}</div>`
        }
      })
    );
    encounterCount++;

    // Add conditions (ICD-10 codes) if provided
    scenario.conditions.forEach((condition) => {
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
          code: { 
            coding: [{ 
              system: 'http://hl7.org/fhir/sid/icd-10-cm', 
              code: condition.code,
              display: condition.description
            }] 
          }
        })
      );
      conditionCount++;
    });

    // Add procedures (CPT codes) if provided
    scenario.procedures.forEach((procedure) => {
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
          code: { 
            coding: [{ 
              system: 'http://www.ama-assn.org/go/cpt', 
              code: procedure.code,
              display: procedure.description
            }] 
          }
        })
      );
      procedureCount++;
    });

    // Add observations (including clinical notes)
    scenario.observations.forEach((observation) => {
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
          valueQuantity: observation.unit ? { 
            value: parseFloat(observation.value) || observation.value, 
            unit: observation.unit 
          } : null,
          note: observation.type === 'Clinical Note' ? [{ text: observation.value }] : []
        })
      );
      observationCount++;
    });

    console.log(`   ✅ Created encounter with ${scenario.conditions.length} conditions, ${scenario.procedures.length} procedures, ${scenario.observations.length} observations\n`);
  });
});

console.log('='.repeat(60));
console.log('✅ Test Data Created Successfully!\n');
console.log('📊 Summary:');
console.log(`   - Encounters: ${encounterCount}`);
console.log(`   - Conditions (ICD-10): ${conditionCount}`);
console.log(`   - Procedures (CPT): ${procedureCount}`);
console.log(`   - Observations: ${observationCount}`);

// Count scenarios that will trigger coding
const willTriggerCoding = testScenarios.filter(s => s.shouldTriggerCoding).length;
console.log(`   - Scenarios that will trigger medical coding: ${willTriggerCoding}\n`);

console.log('🔄 Now refresh your browser to see Epic EHR data in the Clients tab!');
console.log('\n📋 What you\'ll see:');
console.log('   - Patients with EPIC badge');
console.log('   - ICD-10 diagnosis codes (blue badges)');
console.log('   - CPT procedure codes (green badges)');
console.log('   - Clinical notes in observations');
console.log('   - "View Full EHR Details" button\n');

console.log('🔮 Next Steps (for medical coding integration):');
console.log('   - Encounters WITHOUT codes will trigger medical coding');
console.log('   - Clinical notes will be analyzed by coding orchestrator');
console.log('   - AI will suggest ICD-10 and CPT codes');
console.log('   - Results will be stored and displayed in UI\n');

