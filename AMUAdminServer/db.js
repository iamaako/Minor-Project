const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const { app } = require('electron');
let dbPath;

let db;
let SQL;

async function initDB() {
  dbPath = path.join(app.getPath('documents'), 'AMU_Exam_Database.sqlite');
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing SQLite database via sql.js');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new SQLite database via sql.js');
  }

  // Schema creation
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS students (
      roll_number TEXT PRIMARY KEY,
      name TEXT,
      password TEXT,
      bound_ip TEXT DEFAULT NULL,
      is_locked INTEGER DEFAULT 0,
      assigned_questions TEXT DEFAULT '[]',
      has_submitted INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      time_limit INTEGER,
      difficulty TEXT,
      constraints TEXT,
      sampleInput TEXT,
      sampleOutput TEXT,
      explanation TEXT,
      testCases TEXT
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_number TEXT,
      question_id TEXT,
      code TEXT,
      language TEXT,
      status TEXT,
      timestamp INTEGER,
      FOREIGN KEY(roll_number) REFERENCES students(roll_number),
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );
  `);

  // Attempt migrations (if they fail, it just means they already exist)
  const migrations = [
    `ALTER TABLE students ADD COLUMN name TEXT`,
    `ALTER TABLE students ADD COLUMN password TEXT`,
    `ALTER TABLE students ADD COLUMN bound_ip TEXT DEFAULT NULL`,
    `ALTER TABLE students ADD COLUMN is_locked INTEGER DEFAULT 0`,
    `ALTER TABLE students ADD COLUMN assigned_questions TEXT DEFAULT '[]'`,
    `ALTER TABLE students ADD COLUMN has_submitted INTEGER DEFAULT 0`,
    `ALTER TABLE questions ADD COLUMN time_limit INTEGER`,
    `ALTER TABLE questions ADD COLUMN difficulty TEXT`,
    `ALTER TABLE questions ADD COLUMN constraints TEXT`,
    `ALTER TABLE questions ADD COLUMN sampleInput TEXT`,
    `ALTER TABLE questions ADD COLUMN sampleOutput TEXT`,
    `ALTER TABLE questions ADD COLUMN explanation TEXT`,
    `ALTER TABLE questions ADD COLUMN testCases TEXT`
  ];

  for (let m of migrations) {
    try {
      db.run(m);
    } catch (e) { }
  }

  saveDB();
  return db;
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// ── Admin Auth Functions ──

function getAdminCredentials() {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT id, password FROM admins LIMIT 1');
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        resolve(row);
      } else {
        stmt.free();
        resolve(null);
      }
    } catch (e) { resolve(null); }
  });
}

function createAdmin(id, passwordHash) {
  return new Promise((resolve) => {
    try {
      db.run('INSERT OR REPLACE INTO admins (id, password) VALUES (?, ?)', [id, passwordHash]);
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

// ── Logs ──

function getLogMessages() {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      resolve(results);
    } catch (e) { resolve([]); }
  });
}

function addLogMessage(message) {
  return new Promise((resolve) => {
    try {
      db.run('INSERT INTO logs (timestamp, message) VALUES (?, ?)', [Date.now(), message]);
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

// ── Students ──

function getStudentByRollNumber(rollNumber) {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM students WHERE roll_number = ?');
      stmt.bind([rollNumber]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        resolve(row);
      } else {
        stmt.free();
        resolve(null);
      }
    } catch (e) { resolve(null); }
  });
}

function getAllStudents() {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM students');
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      resolve(results);
    } catch (e) { resolve([]); }
  });
}

function addStudent(rollNumber, name, password, boundIp = null, assignedQuestions = []) {
  return new Promise((resolve) => {
    try {
      db.run(`INSERT OR REPLACE INTO students 
        (roll_number, name, password, bound_ip, is_locked, assigned_questions, has_submitted) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [rollNumber, name, password, boundIp, 0, JSON.stringify(assignedQuestions), 0]
      );
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

function updateStudentLock(rollNumber, isLocked) {
  return new Promise((resolve) => {
    try {
      db.run('UPDATE students SET is_locked = ? WHERE roll_number = ?', [isLocked ? 1 : 0, rollNumber]);
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

function assignQuestionsToStudent(rollNumber, questionsArrStr) {
  return new Promise((resolve) => {
    try {
      db.run('UPDATE students SET assigned_questions = ? WHERE roll_number = ?', [
        typeof questionsArrStr === 'string' ? questionsArrStr : JSON.stringify(questionsArrStr), 
        rollNumber
      ]);
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

function updateStudentSubmissionStatus(rollNumber, hasSubmitted) {
  return new Promise((resolve) => {
    try {
      db.run('UPDATE students SET has_submitted = ? WHERE roll_number = ?', [hasSubmitted ? 1 : 0, rollNumber]);
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

// ── Questions ──

function getQuestions() {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM questions');
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      resolve(results);
    } catch (e) { resolve([]); }
  });
}

function getQuestionById(id) {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM questions WHERE id = ?');
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        resolve(row);
      } else {
        stmt.free();
        resolve(null);
      }
    } catch (e) { resolve(null); }
  });
}

function addQuestion(id, title, description, time_limit, difficulty, constraints, sampleInput, sampleOutput, explanation, testCases) {
  return new Promise((resolve) => {
    try {
      db.run(`INSERT OR REPLACE INTO questions 
        (id, title, description, time_limit, difficulty, constraints, sampleInput, sampleOutput, explanation, testCases) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, title, description, time_limit,
          difficulty, constraints, sampleInput,
          sampleOutput, explanation,
          typeof testCases === 'string' ? testCases : JSON.stringify(testCases || [])
        ]
      );
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

function deleteQuestion(id) {
  return new Promise((resolve) => {
    try {
      db.run('DELETE FROM questions WHERE id = ?', [id]);
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

// ── Submissions ──

function getSubmissionsByStudent(rollNumber) {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM submissions WHERE roll_number = ? ORDER BY timestamp DESC');
      stmt.bind([rollNumber]);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      resolve(results);
    } catch (e) { resolve([]); }
  });
}

function getAllSubmissions() {
  return new Promise((resolve) => {
    try {
      const stmt = db.prepare('SELECT * FROM submissions ORDER BY timestamp DESC');
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      resolve(results);
    } catch (e) { resolve([]); }
  });
}

function addSubmission(rollNumber, questionId, code, language, status) {
  return new Promise((resolve) => {
    try {
      db.run(`INSERT INTO submissions 
        (roll_number, question_id, code, language, status, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [rollNumber, questionId, code, language, status, Date.now()]
      );
      saveDB();
      resolve(true);
    } catch (e) { resolve(false); }
  });
}

module.exports = {
  initDB,
  getAdminCredentials,
  setAdminPassword: (password) => createAdmin('admin', password),
  createAdmin,
  getLogs: getLogMessages,
  getLogMessages,
  insertLog: addLogMessage,
  addLogMessage,
  getStudentByRoll: getStudentByRollNumber,
  getStudentByRollNumber,
  getStudents: getAllStudents,
  getAllStudents,
  addStudent,
  setStudentLockStatus: updateStudentLock,
  updateStudentLock,
  updateAssignedQuestions: assignQuestionsToStudent,
  assignQuestionsToStudent,
  setStudentSubmitted: updateStudentSubmissionStatus,
  updateStudentSubmissionStatus,
  bindStudent: (roll, ip) => new Promise(res => {
    try {
      db.run('UPDATE students SET bound_ip = ? WHERE roll_number = ?', [ip, roll]);
      saveDB();
      res(true);
    } catch(e) { res(false); }
  }),
  unbindStudent: (roll) => new Promise(res => {
    try {
      db.run('UPDATE students SET bound_ip = NULL WHERE roll_number = ?', [roll]);
      saveDB();
      res(true);
    } catch(e) { res(false); }
  }),
  clearTable: (tableName) => new Promise(res => {
    try {
      db.run(`DELETE FROM ${tableName}`);
      saveDB();
      res(true);
    } catch(e) { res(false); }
  }),
  getDb: () => db,
  getQuestions,
  getQuestionById,
  addQuestion,
  deleteQuestion,
  getSubmissionsByStudent,
  getAllSubmissions,
  addSubmission
};
