const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// One file-backed SQLite DB for this service. Each microservice owns its own
// database file — nobody else is allowed to read/write this file directly.
const db = new sqlite3.Database(path.join(__dirname, 'reputation.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      reputationScore INTEGER NOT NULL DEFAULT 100,
      restricted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reputation_history (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
});

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

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    reputationScore: row.reputationScore,
    restricted: !!row.restricted,
    createdAt: row.createdAt,
  };
}

async function insertUser(user) {
  await run(
    `INSERT INTO users (id, username, reputationScore, restricted, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, user.username, user.reputationScore, user.restricted ? 1 : 0, user.createdAt]
  );
  return rowToUser(user);
}

async function getUserById(id) {
  const row = await get(`SELECT * FROM users WHERE id = ?`, [id]);
  return rowToUser(row);
}

async function getUserByUsername(username) {
  const row = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  return rowToUser(row);
}

async function listUsers() {
  const rows = await all(`SELECT * FROM users ORDER BY createdAt ASC`);
  return rows.map(rowToUser);
}

async function updateUserReputation(user) {
  await run(
    `UPDATE users SET reputationScore = ?, restricted = ? WHERE id = ?`,
    [user.reputationScore, user.restricted ? 1 : 0, user.id]
  );
  return getUserById(user.id);
}

async function insertReputationHistory(entry) {
  await run(
    `INSERT INTO reputation_history (id, userId, delta, reason, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.id, entry.userId, entry.delta, entry.reason, entry.createdAt]
  );
  return entry;
}

module.exports = {
  db,
  insertUser,
  getUserById,
  getUserByUsername,
  listUsers,
  updateUserReputation,
  insertReputationHistory,
};
