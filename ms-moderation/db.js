const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// One file-backed SQLite DB for this service, per the architecture's golden
// rule: ms-moderation owns its own data, nobody else touches this file.
const db = new sqlite3.Database(path.join(__dirname, 'moderation.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS moderation_logs (
      id TEXT PRIMARY KEY,
      postId TEXT NOT NULL,
      userId TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('APPROUVE','REJETE')),
      reason TEXT,
      toxicityScore INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
});

// --- Promise wrappers around the callback-based sqlite3 API ---
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// Map a DB row to the shape of the `ModerationReport` proto message.
// Note: `id` and `userId` are kept in the table for traceability/debugging,
// but the proto's ModerationReport only exposes postId/decision/reason/
// toxicityScore/createdAt — so we don't leak the internal columns over gRPC.
function rowToReport(row) {
  if (!row) return null;
  return {
    postId: row.postId,
    decision: row.decision,
    reason: row.reason,
    toxicityScore: row.toxicityScore,
    createdAt: row.createdAt,
  };
}

async function insertLog(log) {
  await run(
    `INSERT INTO moderation_logs (id, postId, userId, decision, reason, toxicityScore, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [log.id, log.postId, log.userId, log.decision, log.reason, log.toxicityScore, log.createdAt]
  );
  return rowToReport(log);
}

// A post could in theory be re-submitted; we always want the most recent
// verdict, hence ORDER BY createdAt DESC LIMIT 1 rather than assuming
// exactly one row per postId.
async function getLatestReportByPostId(postId) {
  const row = await get(
    `SELECT * FROM moderation_logs WHERE postId = ? ORDER BY createdAt DESC LIMIT 1`,
    [postId]
  );
  return rowToReport(row);
}

module.exports = {
  db,
  insertLog,
  getLatestReportByPostId,
};