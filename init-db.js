// init-db.js
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite");

const initDB = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user TEXT,
        msg TEXT
      )`,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  });
};

module.exports = {
  initDB,
  db,
};
