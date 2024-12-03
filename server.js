import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

// Serve static files from the current directory ('dist')
app.use(express.static(__dirname));

// Socket.io setup with CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? false // In production, allow only same-origin requests
      : "http://localhost:5173", // In development
    methods: ["GET", "POST"]
  }
});

// Separate waiting rooms for video and text chat
const waitingUsers = {
  video: new Set(),
  text: new Set()
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let currentRoom = null;
  let currentType = null;

  const findMatch = (type) => {
    if (waitingUsers[type].size > 0) {
      const peer = waitingUsers[type].values().next().value;
      waitingUsers[type].delete(peer);

      const room = `${socket.id}-${peer}`;
      socket.join(room);
      io.sockets.sockets.get(peer)?.join(room);

      io.to(room).emit('chatReady', room);
      return room;
    } else {
      waitingUsers[type].add(socket.id);
      return null;
    }
  };

  socket.on('waiting', ({ type = 'video' }) => {
    currentType = type;
    currentRoom = findMatch(type);
  });

  socket.on('next', ({ type }) => {
    if (currentRoom) {
      socket.to(currentRoom).emit('peerDisconnected');
      socket.leave(currentRoom);
    }

    waitingUsers[type].delete(socket.id);

    currentType = type;
    currentRoom = findMatch(type);
  });

  socket.on('offer', ({ room, offer }) => {
    socket.to(room).emit('offer', offer);
  });

  socket.on('answer', ({ room, answer }) => {
    socket.to(room).emit('answer', answer);
  });

  socket.on('ice-candidate', ({ room, candidate }) => {
    socket.to(room).emit('ice-candidate', candidate);
  });

  socket.on('chat-message', ({ room, message }) => {
    socket.to(room).emit('chat-message', message);
  });

  socket.on('disconnect', () => {
    if (currentType) {
      waitingUsers[currentType].delete(socket.id);
    }
    if (currentRoom) {
      socket.to(currentRoom).emit('peerDisconnected');
    }
    console.log('User disconnected:', socket.id);
  });
});

// Catch all routes and serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});