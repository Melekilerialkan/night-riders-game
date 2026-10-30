const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Harita Kodları: 0=Boş, 1=Dikey (P1), 2=Yatay (P2), 3=Buton, 4=Kapı, 8=Motor, 9=Garaj
const LEVELS = [
  { // SEVİYE 1: EĞİTİM (Boş Alan)
    gridSize: 6,
    map: [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 8, 0, 0, 0], // Motor
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 9]  // Garaj
    ]
  },
  { // SEVİYE 2: İLK DUVARLAR
    gridSize: 8,
    map: [
      [0, 1, 0, 0, 2, 0, 0, 0],
      [0, 2, 0, 1, 0, 0, 1, 0],
      [0, 0, 8, 0, 0, 2, 0, 0], // Motor
      [1, 0, 2, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 2, 1, 0],
      [2, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 0, 1, 0],
      [0, 1, 0, 0, 0, 0, 0, 9]  // Garaj
    ]
  },
  { // SEVİYE 3: KAPILAR VE BUTON
    gridSize: 8,
    map: [
      [0, 1, 0, 0, 2, 0, 0, 0],
      [0, 2, 0, 1, 0, 0, 1, 0],
      [0, 0, 3, 0, 0, 2, 0, 0], // 3: Buton
      [1, 0, 2, 0, 1, 0, 0, 0],
      [0, 0, 0, 4, 0, 2, 1, 0], // 4: Kapı
      [2, 0, 1, 0, 0, 0, 0, 0],
      [8, 0, 0, 2, 0, 0, 1, 0], // 8: Motor
      [0, 1, 0, 0, 0, 0, 0, 9]  // 9: Garaj
    ]
  }
];

let rooms = {};

io.on('connection', (socket) => {
  let roomId = "main-room";
  socket.join(roomId);

  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [], levelIndex: 0, lives: 3, 
      gateOpen: false, driverId: null, together: false, map: []
    };
    loadLevel(roomId);
  }

  const room = rooms[roomId];

  if (room.players.length < 2) {
    const role = room.players.length === 0 ? 'player1' : 'player2';
    const initPos = role === 'player1' ? { x: 0, y: 0 } : { x: 5, y: 0 };
    
    room.players.push({ id: socket.id, role, x: initPos.x, y: initPos.y });
    socket.emit('roleAssigned', { role, lives: room.lives });

    if (room.players.length === 2) sendGameState(roomId);
  }

  socket.on('move', (dir) => {
    if (room.players.length < 2) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Eğer motora binildiyse ve bu kişi şoför değilse hareket edemez (yolcu)
    if (room.together && room.driverId !== player.id) return;

    let newX = player.x, newY = player.y;
    if (dir === 'UP') newY--;
    if (dir === 'DOWN') newY++;
    if (dir === 'LEFT') newX--;
    if (dir === 'RIGHT') newX++;

    const gridSize = LEVELS[room.levelIndex].gridSize;
    if (newX < 0 || newX >= gridSize || newY < 0 || newY >= gridSize) return;

    const cellTarget = room.map[newY][newX];

    // Duvar Çarpışması Kontrolü
    let hitWall = false;
    if (cellTarget === 1 && player.role === 'player2') hitWall = true; 
    if (cellTarget === 2 && player.role === 'player1') hitWall = true;
    if (cellTarget === 4 && !room.gateOpen) hitWall = true;

    if (hitWall) {
      room.lives--;
      io.to(roomId).emit('wallHit', { lives: room.lives });
      if (room.lives <= 0) restartRoom(roomId);
      return;
    }

    // Hareket Başarılı
    player.x = newX;
    player.y = newY;
    if (room.together) {
      // Şoför hareket edince yolcu da onunla gelir
      const passenger = room.players.find(p => p.id !== room.driverId);
      passenger.x = newX; passenger.y = newY;
    }

    // 1. Motoru Alma (Kask Motora Biniyor)
    if (cellTarget === 8 && !room.driverId) {
      room.driverId = player.id;
      room.map[newY][newX] = 0; // Motor haritadan silinir, oyuncuya geçer
      io.to(roomId).emit('msg', '🏍️ Biri motora bindi! Şimdi arkadaşını almalısın.');
    }

    // 2. Arkadaşı Arkaya Alma
    if (room.driverId === player.id && !room.together) {
      const otherPlayer = room.players.find(p => p.id !== player.id);
      if (player.x === otherPlayer.x && player.y === otherPlayer.y) {
        room.together = true;
        io.to(roomId).emit('msg', '✅ Arkadaşını aldın! Şimdi doğruca Garaja (🅿️)!');
      }
    }

    // Buton Kontrolü
    if (cellTarget === 3) {
      room.gateOpen = true;
      io.to(roomId).emit('msg', '🔓 GARAJ KAPISI AÇILDI!');
    }

    // 3. Garaja Ulaşma ve Bölüm Geçme
    if (cellTarget === 9 && room.together) {
      room.levelIndex++;
      if (room.levelIndex >= LEVELS.length) {
        io.to(roomId).emit('msg', '🏆 OYUNU BİTİRDİNİZ! HARİKASINIZ!');
        restartRoom(roomId, true);
      } else {
        io.to(roomId).emit('msg', `🎉 Seviye ${room.levelIndex} Tamamlandı! Sonraki Seviye Başlıyor...`);
        loadLevel(roomId);
      }
    }

    sendGameState(roomId);
  });

  socket.on('disconnect', () => {
    if (rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    }
  });
});

function loadLevel(roomId) {
  const room = rooms[roomId];
  // Haritayı kopyalayarak yükle (Motor alındığında silinebilsin diye)
  room.map = JSON.parse(JSON.stringify(LEVELS[room.levelIndex].map));
  room.gateOpen = false;
  room.driverId = null;
  room.together = false;
  if(room.players[0]) { room.players[0].x = 0; room.players[0].y = 0; }
  if(room.players[1]) { room.players[1].x = LEVELS[room.levelIndex].gridSize - 1; room.players[1].y = 0; }
}

function restartRoom(roomId, fullReset = false) {
  const room = rooms[roomId];
  if(fullReset) room.levelIndex = 0;
  room.lives = 3;
  loadLevel(roomId);
  io.to(roomId).emit('msg', '💥 Can Bitti veya Oyun Sıfırlandı! Tekrar Dene.');
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
      lives: room.lives, level: room.levelIndex + 1,
      driverId: room.driverId, together: room.together,
      gridSize: LEVELS[room.levelIndex].gridSize
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu port ${PORT} üzerinde hazır.`));