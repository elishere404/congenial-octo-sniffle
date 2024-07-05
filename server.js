const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const sharedSession = require('express-socket.io-session');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const secretKey = 'aa124853';
const db = new sqlite3.Database('messages.db');

// Session management
const sessionMiddleware = session({
    secret: secretKey,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
});

// Use session middleware
app.use(sessionMiddleware);

// Share session with Socket.io
io.use(sharedSession(sessionMiddleware, {
    autoSave: true
}));

// Multer setup for file uploads
const upload = multer({ dest: 'public/uploads/' });

app.use(express.static('public'));

// Middleware to handle JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/login', upload.single('profilePic'), (req, res) => {
    const { username, keepLoggedIn } = req.body;
    const profilePic = req.file ? `/uploads/${req.file.filename}` : 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Default_pfp.svg';

    const accessToken = jwt.sign({ username }, secretKey);

    req.session.user = { username, profilePic, accessToken };

    if (keepLoggedIn) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    res.redirect('/');
});

app.post('/update-settings', upload.single('profilePic'), (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { username } = req.body;
    const profilePic = req.file ? `/uploads/${req.file.filename}` : req.session.user.profilePic;

    req.session.user.username = username;
    req.session.user.profilePic = profilePic;

    res.json({ success: true });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/session', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

app.delete('/message/:id', (req, res) => {
    const { id } = req.params;
    const { accessToken } = req.session.user;

    jwt.verify(accessToken, secretKey, (err, decoded) => {
        if (err) return res.sendStatus(403);

        db.get('SELECT user FROM messages WHERE id = ?', [id], (err, row) => {
            if (err || !row || row.user !== decoded.username) {
                return res.sendStatus(403);
            }

            db.run('DELETE FROM messages WHERE id = ?', [id], (err) => {
                if (err) {
                    return res.sendStatus(500);
                }

                io.emit('delete message', id);
                res.sendStatus(200);
            });
        });
    });
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Send existing messages to the connected client
    db.all('SELECT * FROM messages', [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        rows.forEach((row) => {
            socket.emit('chat message', row);
        });
    });

    socket.on('chat message', (msg) => {
        if (!socket.handshake.session.user) {
            return;
        }
        const message = { id: Date.now().toString(), user: socket.handshake.session.user.username, msg };
        
        db.run('INSERT INTO messages (id, user, msg) VALUES (?, ?, ?)', [message.id, message.user, message.msg], (err) => {
            if (err) {
                return console.error(err);
            }
            io.emit('chat message', message);
        });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
