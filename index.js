const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mysql = require('mysql2');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "password",
    database: "confessions_db"
});

db.connect(err => {
    if (err) {
        console.error("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to MySQL database");
});

// Create tables if not exist
// const createTables = `
//     CREATE TABLE IF NOT EXISTS confessions (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         text TEXT NOT NULL,
//         category VARCHAR(255) NOT NULL,
//         upvotes INT DEFAULT 0,
//         downvotes INT DEFAULT 0,
//         createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
    
//     CREATE TABLE IF NOT EXISTS comments (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         confessionId INT NOT NULL,
//         text TEXT NOT NULL,
//         createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (confessionId) REFERENCES confessions(id) ON DELETE CASCADE
//     );
// `;

// db.query(createTables, (err, result) => {
//     if (err) console.error("Error creating tables: ", err);
//     else console.log("Tables ensured");
// });


const SECRET_KEY = process.env.JWT_SECRET || 'supersecretkey';
const SALT_ROUNDS = 12;

app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(helmet());

// Rate Limiting to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many login attempts. Try again later."
});

function authenticateToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Access Denied' });
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid Token' });
    req.user = user;
    next();
  });
}

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const query = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
  
  db.query(query, [username, email, hashedPassword], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'User registered successfully' });
  });
});

app.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = results[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '30m' });
    res.json({ token });
  });
});

app.get('/profile', authenticateToken, (req, res) => {
  res.json({ message: `Welcome, ${req.user.username}!` });
});


app.post("/confession", (req, res) => {
    const { text, category } = req.body;
    db.query("INSERT INTO confessions (text, category) VALUES (?, ?)", [text, category], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, text, category, upvotes: 0, downvotes: 0, createdAt: new Date() });
    });
});

app.get("/confessions", (req, res) => {
    db.query("SELECT * FROM confessions ORDER BY createdAt DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post("/upvote/:id", (req, res) => {
    db.query("UPDATE confessions SET upvotes = upvotes + 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Upvoted" });
    });
});

app.post("/downvote/:id", (req, res) => {
    db.query("UPDATE confessions SET downvotes = downvotes + 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Downvoted" });
    });
});

app.post("/comment", (req, res) => {
    const { confessionId, text } = req.body;
    db.query("INSERT INTO comments (confessionId, text) VALUES (?, ?)", [confessionId, text], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, confessionId, text, createdAt: new Date() });
    });
});

app.get("/comments/:confessionId", (req, res) => {
    db.query("SELECT * FROM comments WHERE confessionId = ? ORDER BY createdAt ASC", [req.params.confessionId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

const PORT = 5004;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
