// STAND-IN FOR THE SPRINT 3 KAFKA CONSUMER.
// In Sprint 3, `kafka/consumer.js` will subscribe to `content.submitted` and,
// for each message `{ postId, userId, text, createdAt }`, do exactly what
// this script does manually: evaluate(text) -> insertLog(...). This script
// lets us prove that logic works correctly today, without Kafka existing yet.
const { v4: uuidv4 } = require('uuid');
const { evaluate } = require('./rules');
const db = require('./db');

async function simulateContentSubmitted({ postId, userId, text }) {
  const verdict = evaluate(text);

  const log = {
    id: uuidv4(),
    postId,
    userId,
    decision: verdict.decision,
    reason: verdict.reason,
    toxicityScore: verdict.toxicityScore,
    createdAt: new Date().toISOString(),
  };

  const report = await db.insertLog(log);
  console.log(`[simulated] postId=${postId} -> ${report.decision} (score=${report.toxicityScore}) reason="${report.reason}"`);
  return report;
}

if (require.main === module) {
  (async () => {
    await simulateContentSubmitted({
      postId: 'post-001',
      userId: 'user-karim',
      text: 'Bonjour, voici mon premier post sur SocioGuard !',
    });

    await simulateContentSubmitted({
      postId: 'post-002',
      userId: 'user-karim',
      text: 'Attention ceci est une arnaque, ne payez pas.',
    });

    console.log('\nSimulated logs inserted. Now query them via gRPC with test-client.js');
    process.exit(0);
  })();
}

module.exports = { simulateContentSubmitted };