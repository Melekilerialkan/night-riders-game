const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

const TUTORIAL_STEPS = [
  {
    instruction: "EĞİTİM: Görmeyen oyuncu butona basıp kapıyı açmalı. Sonra birlikte garaja sürün!",
    gridSize: 4,
    map: [
      [0, 0, 0, 3], 
      [0, 1, 0, 0], 
      [0, 0, 2, 0], 
      [8, 0, 0, 9]  
    ]
  }
];

function generateLevel(levelIndex) {
  const size = Math.min(4 + levelIndex, 10);
  let map = Array(size).fill(0).map(() => Array(size).fill(0));

  map[size-1][size-1] = 9; 
  map[size-1][0] = 8;      
  map[0][Math.floor(size/2)] = 3; 

  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (Math.random() < 0.20) {
        map[r][c] = Math.random() > 0.5 ? 1 : 2; 
      }
    }
  }
  return { gridSize: size, map };
}

io.on('connection', (socket) => {
  let currentRoomId = null;

  socket.on('joinRoom', ({ name, roomCode }) => {
    currentRoomId = roomCode ? roomCode.trim() : "main-room";
    
    if (!rooms[currentRoomId]) {
      rooms[currentRoomId] = {
        players: [], levelIndex: 0, motorLives: 3, 
        gameMode: 'classic', timeLeft: 60, timerInterval: null,
        gateOpen: false, driverId: null, together: false, map: [], gridSize: 4,
        gameState: 'LOBBY', buttonVisibleTo: 'player1'
      };
    }

    const room = rooms[currentRoomId];

    if (room.players.length >= 2) {
      socket.emit('roomFull', 'Bu oda şu an dolu!');
      return;
    }

    socket.join(currentRoomId);
    const role = room.players.length === 0 ? 'player1' : 'player2';
    const initPos = role === 'player1' ? { x: 0, y: 0 } : { x: room.gridSize - 1, y: 0 };
    
    room.players.push({ id: socket.id, name: name || 'Sürücü', role, x: initPos.x, y: initPos.y, lives: 3 });
    socket.emit('roleAssigned', { role });

    sendGameState(currentRoomId);
  });

  socket.on('startGame', ({ mode, startingLevel }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (room.players.length === 2) {
      room.gameMode = mode;
      room.levelIndex = startingLevel;
      room.gameState = 'PLAYING';
      room.motorLives = 3;
      room.players.forEach(p => p.lives = 3);
      loadLevel(currentRoomId);

      if (room.gameMode === 'timed') {
        room.timeLeft = 60;
        if (room.timerInterval) clearInterval(room.timerInterval);
        room.timerInterval = setInterval(() => {
          room.timeLeft--;
          io.to(currentRoomId).emit('timerUpdate', room.timeLeft);
          if (room.timeLeft <= 0) {
            clearInterval(room.timerInterval);
            room.gameState = 'GAMEOVER';
            io.to(currentRoomId).emit('msg', '⏰ Süre bitti! Polisler yakaladı.');
            sendGameState(currentRoomId);
          }
        }, 1000);
      }
      sendGameState(currentRoomId);
    }
  });

  socket.on('move', (dir) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.players.length < 2 || room.gameState !== 'PLAYING') return;

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

    if (player.role === 'player1') {
      if (currentCell === 1) hitWall = true;
      if (cellTarget === 1) hitWall = true;
    }
    if (player.role === 'player2') { 
      if (currentCell === 2) hitWall = true;
      if (cellTarget === 2) hitWall = true;
    }

    if (hitWall) {
      if (room.driverId) {
        room.motorLives--;
        io.to(currentRoomId).emit('motorHit', {});

        const emptySpots = [];
        for(let r=0; r<room.gridSize; r++){
          for(let c=0; c<room.gridSize; c++){
            if(room.map[r][c] === 0) emptySpots.push({x: c, y: r});
          }
        }
        if(emptySpots.length > 0) {
          const p1 = room.players[0];
          const p2 = room.players[1];
          const spot1 = emptySpots[Math.floor(Math.random() * emptySpots.length)];
          p1.x = spot1.x; p1.y = spot1.y;
          if (emptySpots.length > 1) {
            let spot2 = emptySpots[Math.floor(Math.random() * emptySpots.length)];
            p2.x = spot2.x; p2.y = spot2.y;
          }
        }
        room.together = false;

        if (room.motorLives <= 0) {
          if (room.timerInterval) clearInterval(room.timerInterval);
          room.gameState = 'GAMEOVER';
          io.to(currentRoomId).emit('msg', '💥 Motor hurdaya çıktı! Oyun bitti.');
        }
      } else {
        player.lives--;
        io.to(currentRoomId).emit('msg', `${player.name} duvara çarptı! Can: ${player.lives}`);
        if (player.lives <= 0) {
          if (room.timerInterval) clearInterval(room.timerInterval);
          room.gameState = 'GAMEOVER';
          io.to(currentRoomId).emit('msg', `💥 ${player.name}'in canı bitti! Oyun bitti.`);
        }
      }
      sendGameState(currentRoomId);
      return;
    }

    if (cellTarget === 9 && !room.gateOpen) {
      io.to(currentRoomId).emit('msg', '🔒 Garaj kapalı! Önce butona basılmalı.');
      return;
    }

    player.x = newX;
    player.y = newY;
    if (room.together) {
      const passenger = room.players.find(p => p.id !== room.driverId);
      passenger.x = newX; passenger.y = newY;
    }

    if (cellTarget === 3 && !room.gateOpen) { 
      if (player.role !== room.buttonVisibleTo) {
        room.gateOpen = true;
        io.to(currentRoomId).emit('msg', '🔓 GARAJ KAPISI AÇILDI!');
      } else {
        io.to(currentRoomId).emit('msg', '❌ Bu butonu sen görüyorsun, basamazsın!');
      }
    }

    if (cellTarget === 8 && !room.driverId) { 
      if (!room.gateOpen) {
        io.to(currentRoomId).emit('msg', '🔒 Önce butona basıp garaj kapısını açmalısın!');
        return; 
      }
      room.driverId = player.id;
      room.map[newY][newX] = 0; 
      io.to(currentRoomId).emit('playSound', 'motorCalisti');
      io.to(currentRoomId).emit('msg', '🏍️ Motora binildi!');
    }

    if (room.driverId === player.id && !room.together) { 
      const otherPlayer = room.players.find(p => p.id !== room.driverId);
      if (player.x === otherPlayer.x && player.y === otherPlayer.y) {
        room.together = true;
        io.to(currentRoomId).emit('msg', '✅ Arkadaşın arkada! Çıkışa sürün.');
      }
    }

    if (cellTarget === 9 && room.together) { 
      if (room.levelIndex === 0) {
        // EĞİTİM BİTTİĞİNDE POP-UP ÇIKMADAN DİREKT LOBİYE DÖNER
        room.gameState = 'LOBBY';
        if (room.timerInterval) clearInterval(room.timerInterval);
        io.to(currentRoomId).emit('msg', '🎉 Eğitim Tamamlandı! Lobiye dönüldü.');
      } else {
        room.levelIndex++;
        io.to(currentRoomId).emit('msg', `🎉 Seviye ${room.levelIndex} Başlıyor!`);
        loadLevel(currentRoomId);
      }
    }

    sendGameState(currentRoomId);
  });

  socket.on('quickCommand', (cmd) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const sender = rooms[currentRoomId].players.find(p => p.id === socket.id);
    const senderName = sender ? sender.name : 'Partner';
    socket.to(currentRoomId).emit('popupMessage', { name: senderName, text: cmd });
  });

  socket.on('restartGame', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    room.gameState = 'LOBBY';
    room.levelIndex = 0;
    room.motorLives = 3;
    room.players.forEach(p => p.lives = 3);
    if (room.timerInterval) clearInterval(room.timerInterval);
    sendGameState(currentRoomId);
  });

  socket.on('disconnect', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      rooms[currentRoomId].players = rooms[currentRoomId].players.filter(p => p.id !== socket.id);
      if (rooms[currentRoomId].players.length === 0) {
        if (rooms[currentRoomId].timerInterval) clearInterval(rooms[currentRoomId].timerInterval);
        delete rooms[currentRoomId];
      } else {
        rooms[currentRoomId].gameState = 'LOBBY';
        sendGameState(currentRoomId);
      }
    }
  });
});

function loadLevel(roomId) {
  const room = rooms[roomId];
  const levelData = room.levelIndex === 0 ? TUTORIAL_STEPS[0] : generateLevel(room.levelIndex);
  
  room.map = JSON.parse(JSON.stringify(levelData.map));
  room.gridSize = levelData.gridSize;
  room.buttonVisibleTo = Math.random() > 0.5 ? 'player1' : 'player2';
  room.gateOpen = false; 
  room.driverId = null;
  room.together = false;
  room.motorLives = 3;

  if(room.players[0]) { room.players[0].x = 0; room.players[0].y = 0; }
  if(room.players[1]) { room.players[1].x = room.gridSize - 1; room.players[1].y = 0; }
}

function sendGameState(roomId) {
  const room = rooms[roomId];
  room.players.forEach(p => {
    const filteredMap = room.map.map(row => row.map(cell => {
      if (cell === 8 || cell === 9) return cell;
      if (cell === 3) return p.role === room.buttonVisibleTo ? 3 : 0; 
      if (cell === 1 && p.role === 'player1') return 1; 
      if (cell === 2 && p.role === 'player2') return 2; 
      return 0;
    }));
    io.to(p.id).emit('gameState', {
      map: filteredMap, players: room.players, 
      motorLives: room.motorLives, level: room.levelIndex,
      driverId: room.driverId, together: room.together,
      gridSize: room.gridSize, gateOpen: room.gateOpen,
      gameState: room.gameState, gameMode: room.gameMode, timeLeft: room.timeLeft
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu port ${PORT} üzerinde hazır.`));