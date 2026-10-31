const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

const TUTORIAL_LEVEL = {
  gridSize: 6,
  map: [
    [0, 0, 0, 0, 0, 3], // Buton Sağ Üstte
    [0, 0, 0, 0, 0, 0],
    [0, 0, 8, 0, 0, 0], // Motor Ortada
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 9]  // Garaj Sağ Altta
  ]
};

function generateRandomLevel(levelIndex) {
  const size = Math.min(6 + (levelIndex * 2), 12); 
  let map = Array(size).fill(0).map(() => Array(size).fill(0));

  map[size-1][size-1] = 9; // Garaj (Çıkış)
  map[size-1][0] = 8;      // Motor
  map[0][Math.floor(size/2)] = 3; // Buton

  for (let r = 1; r < size - 1; r++) {
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
      gateOpen: false, driverId: null, together: false, map: [], gridSize: 6,
      gameState: 'LOBBY',
      buttonVisibleTo: 'player1' // YENİ: Butonu kimin göreceği
    };
  }

  const room = rooms[roomId];

  if (room.players.length < 2) {
    const role = room.players.length === 0 ? 'player1' : 'player2';
    const initPos = role === 'player1' ? { x: 0, y: 0 } : { x: room.gridSize - 1, y: 0 };
    
    room.players.push({ id: socket.id, role, x: initPos.x, y: initPos.y });
    socket.emit('roleAssigned', { role, lives: room.lives });

    if (room.players.length === 2) sendGameState(roomId);
  }

  socket.on('startGame', (startingLevel) => {
    if (room.gameState === 'LOBBY') {
      room.levelIndex = startingLevel;
      room.gameState = 'PLAYING';
      loadLevel(roomId);
      
      if (startingLevel === 0) {
        io.to(roomId).emit('msg', '🎓 EĞİTİM: Biriniz GİZLİ BUTONU görüyor. Görmeyen kişiyi yönlendirip butona bastırın!');
      } else {
        io.to(roomId).emit('msg', '🚀 Gerçek Görev Başladı!');
      }
      sendGameState(roomId);
    }
  });

  socket.on('move', (dir) => {
    if (room.players.length < 2 || room.gameState !== 'PLAYING') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || (room.together && room.driverId !== player.id)) return;

    let newX = player.x, newY = player.y;
    if (dir === 'UP') newY--;
    if (dir === 'DOWN') newY++;
    if (dir === 'LEFT') newX--;
    if (dir === 'RIGHT') newX++;

    if (newX < 0 || newX >= room.gridSize || newY < 0 || newY >= room.gridSize) return;

    const currentCell = room.map[player.y][player.x];
    const cellTarget = room.map[newY][newX];
    
    let hitWall = false;

    if (player.role === 'player1') {
      if (dir === 'DOWN' && currentCell === 2) hitWall = true; 
      if (dir === 'UP' && cellTarget === 2) hitWall = true;    
    }
    if (player.role === 'player2') { 
      if (dir === 'RIGHT' && currentCell === 1) hitWall = true; 
      if (dir === 'LEFT' && cellTarget === 1) hitWall = true;   
    }

    if (hitWall) {
      room.lives--;
      io.to(roomId).emit('wallHit', { lives: room.lives });
      if (room.lives <= 0) restartRoom(roomId);
      return;
    }

    // YENİ: Kapalı garaja girmeyi hasar vermeden engelle
    if (cellTarget === 9 && !room.gateOpen) {
      io.to(roomId).emit('msg', '🔒 Garaj henüz kapalı! Önce gizli butonu bulmalısınız.');
      return;
    }

    player.x = newX;
    player.y = newY;
    if (room.together) {
      const passenger = room.players.find(p => p.id !== room.driverId);
      passenger.x = newX; passenger.y = newY;
    }

    // YENİ: Görmeyen oyuncunun butona basma mantığı
    if (cellTarget === 3 && !room.gateOpen) { 
      if (player.role !== room.buttonVisibleTo) {
        room.gateOpen = true;
        io.to(roomId).emit('msg', room.levelIndex === 0 
          ? '🔓 HARİKA! Garaj açıldı. Şimdi Motoru (🏍️) bulun. (İlk binen şoför olur)' 
          : '🔓 KAPILAR AÇILDI! Motoru alıp çıkışa gidin!');
      } else {
        io.to(roomId).emit('msg', '❌ Sen butonu görüyorsun, basamazsın! Görmeyen oyuncuyu buraya yönlendir!');
      }
    }

    if (cellTarget === 8 && !room.driverId) { 
      room.driverId = player.id;
      room.map[newY][newX] = 0; 
      io.to(roomId).emit('playSound', 'motorCalisti');
      io.to(roomId).emit('msg', room.levelIndex === 0 
        ? '🏍️ Şoför sensin! Şimdi arkadaşının yanına gidip onu arkana al.' 
        : '🏍️ Biri motora bindi! Arkadaşını al.');
    }

    if (room.driverId === player.id && !room.together) { 
      const otherPlayer = room.players.find(p => p.id !== player.id);
      if (player.x === otherPlayer.x && player.y === otherPlayer.y) {
        room.together = true;
        io.to(roomId).emit('msg', room.levelIndex === 0 
          ? '✅ Harika! Şimdi birlikte Açık Garaja girin ve eğitimi bitirin!' 
          : '✅ Arkadaşını aldın! Çıkışa git!');
      }
    }

    if (cellTarget === 9 && room.together) { 
      room.levelIndex++;
      io.to(roomId).emit('msg', room.levelIndex === 1 
        ? `🎉 Eğitim Bitti! Gerçek Seviye ${room.levelIndex} Üretiliyor...` 
        : `🎉 Seviye ${room.levelIndex - 1} Bitti! Yeni Seviye Üretiliyor...`);
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
  
  // YENİ: Butonu her seviyede rastgele bir oyuncuya göster
  room.buttonVisibleTo = Math.random() > 0.5 ? 'player1' : 'player2';

  room.gateOpen = false; 
  room.driverId = null;
  room.together = false;

  if(room.players[0]) { room.players[0].x = 0; room.players[0].y = 0; }
  if(room.players[1]) { room.players[1].x = room.gridSize - 1; room.players[1].y = 0; }
}

function restartRoom(roomId, fullReset = false) {
  const room = rooms[roomId];
  if(fullReset) room.gameState = 'LOBBY';
  room.lives = 3;
  if(room.gameState === 'PLAYING') loadLevel(roomId);
  io.to(roomId).emit('msg', '💥 Can Bitti! Baştan başlıyor.');
  sendGameState(roomId);
}

function sendGameState(roomId) {
  const room = rooms[roomId];
  room.players.forEach(p => {
    const filteredMap = room.map.map(row => row.map(cell => {
      if (cell === 8 || cell === 9) return cell;
      
      // Sadece seçili kişi butonu görür
      if (cell === 3) return p.role === room.buttonVisibleTo ? 3 : 0; 
      
      if (p.role === 'player1' && cell === 1) return 1; 
      if (p.role === 'player2' && cell === 2) return 2; 
      return 0;
    }));
    io.to(p.id).emit('gameState', {
      map: filteredMap, players: room.players, 
      lives: room.lives, level: room.levelIndex,
      driverId: room.driverId, together: room.together,
      gridSize: room.gridSize, gateOpen: room.gateOpen,
      gameState: room.gameState 
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu port ${PORT} üzerinde hazır.`));