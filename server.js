const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const { initDB, db } = require('./init-db');
const uuid = require('uuid'); // Ensure you have uuid installed
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'aa124558',
  resave: false,
  saveUninitialized: true,
}));

// Serve static files from the 'public' directory
app.use(express.static('public'));

app.post('/login', (req, res) => {
  const { username } = req.body;
  req.session.user = {
    id: uuid.v4(),
    username,
  };
  res.redirect('/');
});

app.get('/', (req, res) => {
  if (req.session.user) {
    res.sendFile(__dirname + '/public/chat.html');
  } else {
    res.sendFile(__dirname + '/public/login.html');
  }
});

// WebSocket connection
io.use((socket, next) => {
  const sessionID = socket.request._query['sessionID'];
  if (sessionID) {
    // Here we assume that sessionID is valid and contains user info
    socket.request.sessionID = sessionID;
    socket.request.session = {}; // In a real scenario, retrieve the session using sessionID
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const { user } = socket.request.session;
  if (!user) {
    return socket.disconnect(true);
  }

  socket.on('chat message', (msg) => {
    const message = { id: Date.now().toString(), user: user.username, msg };
    db.run(`INSERT INTO messages (id, user, msg) VALUES (?, ?, ?)`, [message.id, message.user, message.msg], (err) => {
      if (err) {
        console.error(err.message);
        return;
      }
      io.emit('chat message', message);
    });
  });

  socket.on('delete message', (messageId) => {
    db.get(`SELECT user FROM messages WHERE id = ?`, [messageId], (err, row) => {
      if (err) {
        console.error(err.message);
        return;
      }
      if (row && row.user === user.username) {
        db.run(`DELETE FROM messages WHERE id = ?`, [messageId], (err) => {
          if (err) {
            console.error(err.message);
            return;
          }
          io.emit('delete message', messageId);
        });
      }
    });
  });
});

// Start the server after initializing the database
(async () => {
  try {
    await initDB();
    console.log('Database initialized');
    server.listen(3000, () => {
      console.log('Server is running on http://localhost:3000');
    });
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
})();
