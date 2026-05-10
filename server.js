'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
  maxHttpBufferSize: 5e6
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── DATA MODEL ───────────────────────────────────────────────────────────────
const PALETTE      = ['#6c8fff','#ff6b9d','#4ecca3','#feca57','#ff9f43','#a29bfe','#48dbfb','#f8a5c2','#78e08f','#e55039'];
const MAX_STROKES  = 3000;
const MAX_MESSAGES = 50;
const ROOM_TTL_MS  = 30 * 60 * 1000;

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users:    new Map(),
      strokes:  [],
      snapshot: null,
      snapAt:   0,
      messages: [],
      timer:    null
    });
  }
  return rooms.get(roomId);
}

function pickColor(room) {
  const used = new Set([...room.users.values()].map(u => u.color));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[Math.floor(Math.random()*PALETTE.length)];
}

function roomUserList(room) {
  return [...room.users.entries()].map(([id, u]) => ({ id, name: u.name, color: u.color }));
}

// ─── SOCKET HANDLERS ─────────────────────────────────────────────────────────
io.on('connection', socket => {
  let currentRoom = null;
  let userId      = null;
  let userMeta    = null;

  socket.on('join-room', ({ roomId, userId: uid, name }, ack) => {
    if (!roomId || !uid) return;
    currentRoom = roomId.toUpperCase().trim();
    userId      = uid;
    const room  = getRoom(currentRoom);
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    const color = room.users.has(userId) ? room.users.get(userId).color : pickColor(room);
    userMeta = { name: name || 'زائر', color, socketId: socket.id, joinedAt: Date.now() };
    room.users.set(userId, userMeta);
    socket.join(currentRoom);
    if (typeof ack === 'function') ack({ ok: true, color, users: roomUserList(room) });
    if (room.snapshot) {
      socket.emit('canvas-snapshot', { dataUrl: room.snapshot, strokesAfter: room.strokes.slice(room.snapAt) });
    } else if (room.strokes.length) {
      socket.emit('canvas-replay', room.strokes);
    }
    if (room.messages.length) socket.emit('chat-history', room.messages);
    socket.to(currentRoom).emit('user-joined', { userId, name: userMeta.name, color });
    io.to(currentRoom).emit('room-users', roomUserList(room));
  });

  socket.on('stroke', data => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    pushStroke(room, { type: 'stroke', ...data });
    socket.to(currentRoom).emit('stroke', data);
  });

  socket.on('shape', data => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    pushStroke(room, { type: 'shape', ...data });
    socket.to(currentRoom).emit('shape', data);
  });

  socket.on('fill', data => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    pushStroke(room, { type: 'fill', ...data });
    socket.to(currentRoom).emit('fill', data);
  });

  socket.on('undo', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (!room.strokes.length) return;
    room.strokes.pop();
    io.to(currentRoom).emit('canvas-replay', room.strokes);
  });

  socket.on('clear', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.strokes = []; room.snapshot = null; room.snapAt = 0;
    io.to(currentRoom).emit('clear', { by: userMeta?.name });
  });

  socket.on('snapshot', ({ dataUrl }) => {
    if (!currentRoom || !dataUrl) return;
    const room = getRoom(currentRoom);
    room.snapshot = dataUrl;
    room.snapAt   = room.strokes.length;
  });

  socket.on('cursor', ({ x, y }) => {
    if (!currentRoom || !userMeta) return;
    socket.to(currentRoom).emit('cursor', { userId, name: userMeta.name, color: userMeta.color, x, y });
  });

  // ── CHAT ──
  socket.on('chat-message', ({ text }, ack) => {
    if (!currentRoom || !userMeta) return;
    const trimmed = (text || '').trim();
    if (!trimmed || trimmed.length > 500) return;
    const message = {
      id:     `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      userId,
      name:   userMeta.name,
      color:  userMeta.color,
      text:   trimmed,
      time:   Date.now()
    };
    const room = getRoom(currentRoom);
    room.messages.push(message);
    if (room.messages.length > MAX_MESSAGES) room.messages = room.messages.slice(-MAX_MESSAGES);
    io.to(currentRoom).emit('chat-message', message);
    if (typeof ack === 'function') ack({ ok: true, id: message.id });
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !userId) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.users.delete(userId);
    socket.to(currentRoom).emit('user-left', { userId });
    io.to(currentRoom).emit('room-users', roomUserList(room));
    if (room.users.size === 0) {
      room.timer = setTimeout(() => {
        if (rooms.has(currentRoom) && rooms.get(currentRoom).users.size === 0) {
          rooms.delete(currentRoom);
          console.log(`Room ${currentRoom} evicted`);
        }
      }, ROOM_TTL_MS);
    }
  });
});

function pushStroke(room, rec) {
  room.strokes.push(rec);
  if (room.strokes.length > MAX_STROKES) {
    room.strokes = room.strokes.slice(500);
    if (room.snapAt > 0) room.snapAt = Math.max(0, room.snapAt - 500);
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  res.json({
    rooms: [...rooms.entries()].map(([id, r]) => ({
      id, users: r.users.size, strokes: r.strokes.length,
      hasSnapshot: !!r.snapshot, messages: r.messages.length
    })),
    total: rooms.size
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎨 SketchSync v2 → http://localhost:${PORT}`));
