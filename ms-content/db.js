const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'content.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_restrictions (
      userId TEXT PRIMARY KEY,
      restricted INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
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

function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    text: row.text,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function rowToRestriction(row) {
  if (!row) return null;
  return {
    userId: row.userId,
    restricted: !!row.restricted,
    updatedAt: row.updatedAt,
  };
}

async function insertPost(post) {
  await run(
    `INSERT INTO posts (id, userId, text, status, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [post.id, post.userId, post.text, post.status, post.createdAt]
  );
  return rowToPost(post);
}

async function getPostById(id) {
  const row = await get(`SELECT * FROM posts WHERE id = ?`, [id]);
  return rowToPost(row);
}

async function listPosts(statusFilter) {
  if (!statusFilter) {
    const rows = await all(`SELECT * FROM posts ORDER BY createdAt DESC`);
    return rows.map(rowToPost);
  }

  const rows = await all(`SELECT * FROM posts WHERE status = ? ORDER BY createdAt DESC`, [statusFilter]);
  return rows.map(rowToPost);
}

async function updatePostStatus(id, status) {
  await run(`UPDATE posts SET status = ? WHERE id = ?`, [status, id]);
  return getPostById(id);
}

async function getRestrictionStatus(userId) {
  const row = await get(`SELECT * FROM user_restrictions WHERE userId = ?`, [userId]);
  return rowToRestriction(row);
}

async function setUserRestriction({ userId, restricted, updatedAt }) {
  const existing = await getRestrictionStatus(userId);

  if (existing) {
    await run(`UPDATE user_restrictions SET restricted = ?, updatedAt = ? WHERE userId = ?`, [restricted ? 1 : 0, updatedAt, userId]);
    return { userId, restricted, updatedAt };
  }

  await run(`INSERT INTO user_restrictions (userId, restricted, updatedAt) VALUES (?, ?, ?)`, [userId, restricted ? 1 : 0, updatedAt]);
  return { userId, restricted, updatedAt };
}

module.exports = {
  insertPost,
  getPostById,
  listPosts,
  updatePostStatus,
  getRestrictionStatus,
  setUserRestriction,
};
