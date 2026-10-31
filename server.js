const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// Sadece Eğitim Bölümü Sabit
const TUTORIAL_LEVEL = {
  gridSize: 6,
  map: [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 8, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 9] 
  ]
};

// Rastgele Harita Üreticisi (Sonsuz Seviye)
function generateRandomLevel(levelIndex) {
  const size = Math.min(6 + (levelIndex * 2), 12); 
  let map = Array(size).fill(0).map(() => Array(size).fill(0));

  map[size-1][size-1] = 9; // Çıkış Garajı (Sağ Alt)
  
  // Motoru koruyan kapalı alan (Sol Alt)
  map[size-1][0] = 8;      
  map[size-2][0] = 4;      
  map[size-1][1] = 4;      
  
  // Buton (Üst orta)
  map[0][Math.floor(size/2)] = 3; 

  // Engeller
  for (let r = 1; r < size - 2; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (Math.random() < 0.25) { 
        map[r][c] = Math.random() > 0.5 ? 1 : 2;
      }
    }
  }
  return { gridSize: size, map };
}

io.on('connection', (socket) => {
  let roomId = "main-room";
  socket.join(roomId);

  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [], levelIndex: 0, lives: 3, 
      gateOpen: false, driverId: null, together: false, map: [], gridSize: 6
    };
    loadLevel(roomId);
  }

  const room = rooms[roomId];

  if (room.players.length < 2) {
    const role = room.players.length === 0 ? 'player1' : 'player2';
    const initPos = role === 'player1' ? { x: 0, y: 0 } : { x: room.gridSize - 1, y: 0 };
    
    room.players.push({ id: socket.id, role, x: initPos.x, y: initPos.y });
    socket.emit('roleAssigned', { role, lives: room.lives });

    if (room.players.length === 2) sendGameState(roomId);
  }

  socket.on('skipTutorial', () => {
    if (room.levelIndex === 0) {
      room.levelIndex = 1;
      loadLevel(roomId);
      io.to(roomId).emit('msg', '⏩ Eğitim Atlandı! Gerçek görev başlıyor.');
      sendGameState(roomId);
    }
  });

  socket.on('move', (dir) => {
    if (room.players.length < 2) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (room.together && room.driverId !== player.id) return;

    let newX = player.x, newY = player.y;
    if (dir === 'UP') newY--;
    if (dir === 'DOWN') newY++;
    if (dir === 'LEFT') newX--;
    if (dir === 'RIGHT') newX++;

    if (newX < 0 || newX >= room.gridSize || newY < 0 || newY >= room.gridSize) return;

    const currentCell = room.map[player.y][player.x];
    const cellTarget = room.map[newY][newX];
    
    let hitWall = false;

    // Kenar Çarpışma Fizikleri
    if (player.role === 'player1') {
      if (dir === 'DOWN' && currentCell === 2) hitWall = true; 
      if (dir === 'UP' && cellTarget === 2) hitWall = true;    
    }
    if (player.role === 'player2') { 
      if (dir === 'RIGHT' && currentCell === 1) hitWall = true; 
      if (dir === 'LEFT' && cellTarget === 1) hitWall = true;   
    }
    if (!room.gateOpen && cellTarget === 4) hitWall = true;

    if (hitWall) {
      room.lives--;
      io.to(roomId).emit('wallHit', { lives: room.lives });
      if (room.lives <= 0) restartRoom(roomId);
      return;
    }

    player.x = newX;
    player.y = newY;
    if (room.together) {
      const passenger = room.players.find(p => p.id !== room.driverId);
      passenger.x = newX; passenger.y = newY;
    }

    if (cellTarget === 8 && !room.driverId) { 
      room.driverId = player.id;
      room.map[newY][newX] = 0; 
      io.to(roomId).emit('msg', '🏍️ Biri motora bindi! Arkadaşını al.');
    }

    if (room.driverId === player.id && !room.together) { 
      const otherPlayer = room.players.find(p => p.id !== player.id);
      if (player.x === otherPlayer.x && player.y === otherPlayer.y) {
        room.together = true;
        io.to(roomId).emit('msg', '✅ Arkadaşını aldın! Çıkışa git!');
      }
    }

    if (cellTarget === 3 && !room.gateOpen) { 
      room.gateOpen = true;
      io.to(roomId).emit('msg', '🔓 KAPILAR AÇILDI! MOTORU ALABİLİRSİN!');
    }

    if (cellTarget === 9 && room.together) { 
      room.levelIndex++;
      io.to(roomId).emit('msg', `🎉 Seviye ${room.levelIndex} Tamamlandı! Yeni Seviye Üretiliyor...`);
      loadLevel(roomId);
    }

    sendGameState(roomId);
  });

  socket.on('quickCommand', (cmd) => socket.to(roomId).emit('receiveCommand', cmd));

  socket.on('disconnect', () => {
    if (rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    }
  });
});

function loadLevel(roomId) {
  const room = rooms[roomId];
  const levelData = room.levelIndex === 0 ? TUTORIAL_LEVEL : generateRandomLevel(room.levelIndex);
  
  room.map = JSON.parse(JSON.stringify(levelData.map));
  room.gridSize = levelData.gridSize;
  
  const hasButton = room.map.some(row => row.includes(3));
  room.gateOpen = !hasButton; 
  room.driverId = null;
  room.together = false;

  if(room.players[0]) { room.players[0].x = 0; room.players[0].y = 0; }
  if(room.players[1]) { room.players[1].x = room.gridSize - 1; room.players[1].y = 0; }
}

function restartRoom(roomId, fullReset = false) {
  const room = rooms[roomId];
  if(fullReset) room.levelIndex = 0;
  room.lives = 3;
  loadLevel(roomId);
  io.to(roomId).emit('msg', '💥 Can Bitti! Aynı seviye baştan başlıyor.');
  sendGameState(roomId);
}

function sendGameState(roomId) {
  const room = rooms[roomId];
  room.players.forEach(p => {
    const filteredMap = room.map.map(row => row.map(cell => {
      if (cell === 8 || cell === 9 || cell === 3 || cell === 4) return cell;
      if (p.role === 'player1' && cell === 1) return 1; 
      if (p.role === 'player2' && cell === 2) return 2; 
      return 0;
    }));
    io.to(p.id).emit('gameState', {
      map: filteredMap, players: room.players, 
      lives: room.lives, level: room.levelIndex,
      driverId: room.driverId, together: room.together,
      gridSize: room.gridSize, gateOpen: room.gateOpen
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu port ${PORT} üzerinde hazır.`));