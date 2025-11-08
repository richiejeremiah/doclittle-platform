const knowledgeService = require('./knowledge-service');
const { generateCodingSuggestion } = require('./medical-coding-service');

function classifyEncounter(encounter) {
  const simpleMatch = knowledgeService.matchSimpleRule({
    appointmentType: encounter.appointmentType,
    durationMinutes: encounter.durationMinutes,
    clinicalNote: encounter.clinicalNote
  });

  if (simpleMatch) {
    return { band: 'SIMPLE', match: simpleMatch };
  }

  const keywordCount = knowledgeService.extractKeywords(encounter.clinicalNote || '', 30).length;
  if (keywordCount <= 12) {
    return { band: 'MODERATE', match: null };
  }

  return { band: 'COMPLEX', match: null };
}

async function runCodingPipeline(encounter) {
  const classification = classifyEncounter(encounter);

  if (classification.band === 'SIMPLE' && classification.match) {
    return {
      band: 'SIMPLE',
      icd10: classification.match.icd10,
      cpt: classification.match.cpt,
      rationale: classification.match.rationale,
      details: {
        rule_id: classification.match.id
      }
    };
  }

  if (classification.band === 'MODERATE') {
    const cptCandidates = knowledgeService.getCandidateCptCodes(encounter.clinicalNote, { limit: 5 });
    return {
      band: 'MODERATE',
      icd10: knowledgeService.getReferenceIcdCodes(3),
      cpt: cptCandidates.slice(0, 1),
      rationale: 'Selected highest-ranked CPT candidate with reference ICD-10 list.',
      details: {
        keywords: knowledgeService.extractKeywords(encounter.clinicalNote, 10)
      }
    };
  }

  const llmResult = await generateCodingSuggestion({
    clinicalNote: encounter.clinicalNote,
    encounterType: encounter.appointmentType,
    patientContext: encounter.patientContext
  });

  return {
    band: 'COMPLEX',
    icd10: llmResult.icd10,
    cpt: llmResult.cpt,
    rationale: llmResult.rationale,
    details: {
      model: llmResult.model
    }
  };
}

module.exports = {
  classifyEncounter,
  runCodingPipeline
};
