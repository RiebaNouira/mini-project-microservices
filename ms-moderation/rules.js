// Pure scoring logic — no DB, no gRPC, no Kafka. Easy to unit-test in
// isolation, and this is exactly the function the Kafka consumer (Sprint 3)
// will call for every `content.submitted` event.
//
// Scoring table (spec §4.2):
//   - contains a forbidden word        -> +50
//   - >70% uppercase, text length > 10 -> +20
//   - same character repeated >=5x     -> +15
//   - empty text or < 2 characters     -> +30
// Threshold: score >= 50 -> REJETE, else APPROUVE.

// Example list — extend this as needed. Kept short and deliberately tame
// since this is a teaching project, not a production moderation system.
const FORBIDDEN_WORDS = ['spam', 'arnaque', 'escroquerie', 'connard', 'idiot'];

function checkForbiddenWord(text) {
  const lower = text.toLowerCase();
  const match = FORBIDDEN_WORDS.find((word) => lower.includes(word));
  if (!match) return null;
  return { points: 50, reason: `mot interdit détecté ("${match}")` };
}

function checkUppercaseRatio(text) {
  if (text.length <= 10) return null;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return null;
  const upperCount = letters.replace(/[^A-Z]/g, '').length;
  const ratio = upperCount / letters.length;
  if (ratio <= 0.7) return null;
  return { points: 20, reason: `plus de 70% de majuscules (${Math.round(ratio * 100)}%)` };
}

function checkRepeatedCharacter(text) {
  // Matches any character repeated 5+ times in a row, e.g. "!!!!!" or "aaaaa"
  if (!/(.)\1{4,}/.test(text)) return null;
  return { points: 15, reason: 'caractère répété au moins 5 fois consécutives' };
}

function checkEmptyOrTooShort(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length >= 2) return null;
  return { points: 30, reason: 'texte vide ou inférieur à 2 caractères' };
}

const REJECTION_THRESHOLD = 50;

/**
 * Evaluate a post's text and return a moderation verdict.
 * @param {string} text
 * @returns {{ decision: 'APPROUVE'|'REJETE', reason: string, toxicityScore: number }}
 */
function evaluate(text) {
  const safeText = text || '';
  const checks = [
    checkEmptyOrTooShort(safeText),
    checkForbiddenWord(safeText),
    checkUppercaseRatio(safeText),
    checkRepeatedCharacter(safeText),
  ].filter(Boolean); // drop the nulls (rules that didn't trigger)

  const toxicityScore = checks.reduce((sum, c) => sum + c.points, 0);
  const decision = toxicityScore >= REJECTION_THRESHOLD ? 'REJETE' : 'APPROUVE';
  const reason = checks.length > 0
    ? checks.map((c) => c.reason).join('; ')
    : 'aucune règle déclenchée';

  return { decision, reason, toxicityScore };
}

module.exports = { evaluate, FORBIDDEN_WORDS, REJECTION_THRESHOLD };