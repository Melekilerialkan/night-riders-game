const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

const GRID_SIZE = 8;
let rooms = {};

// Harita Verisi: 0=Boş, 1=Dikey Duvar (P1 Görür), 2=Yatay Duvar (P2 Görür), 3=Buton, 4=Kapı, 5=Güvenli Bölge, 9=Motor (Çıkış)
const MAP = [
  [0, 1, 0, 0, 2, 0, 0, 0],
  [0, 2, 0, 1, 0, 0, 1, 0],
  [0, 0, 3, 0, 0, 2, 0, 0],
  [1, 0, 2, 0, 1, 0, 0, 0],
  [0, 0, 0, 4, 0, 2, 1, 0],
  [2, 0, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 2, 5, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 0, 9],
];

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Lobiye katılma
  let roomId = "main-room";
  socket.join(roomId);

  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [],
      gateOpen: false,
      lives: 3,
    };
  }

  const room = rooms[roomId];

  if (room.players.length < 2) {
    const role = room.players.length === 0 ? "player1" : "player2";
    const initialPos = role === "player1" ? { x: 0, y: 0 } : { x: 0, y: 1 };

    room.players.push({
      id: socket.id,
      role: role,
      x: initialPos.x,
      y: initialPos.y,
    });

    socket.emit("roleAssigned", { role, lives: room.lives });

    if (room.players.length === 2) {
      // Oyunu başlat
      sendGameState(roomId);
    }
  } else {
    socket.emit("roomFull");
  }

  // Hareket kontrolü
  socket.on("move", (dir) => {
    if (room.players.length < 2) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    let newX = player.x;
    let newY = player.y;

    if (dir === "UP") newY--;
    if (dir === "DOWN") newY++;
    if (dir === "LEFT") newX--;
    if (dir === "RIGHT") newX++;

    // Sınır kontrolü
    if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) return;

    const cellTarget = MAP[newY][newX];

    // Duvar Çarpışma Kontrolü (Görünmez duvara toslama -> Can düşer)
    let hitWall = false;
    if (cellTarget === 1 && player.role === "player2") hitWall = true; // P2 dikey duvara tosladı
    if (cellTarget === 2 && player.role === "player1") hitWall = true; // P1 yatay duvara tosladı
    if (cellTarget === 4 && !room.gateOpen) hitWall = true; // Kapı kapalıysa tosladı

    if (hitWall) {
      room.lives--;
      io.to(roomId).emit("wallHit", { lives: room.lives, hitBy: player.role });
      if (room.lives <= 0) {
        // Can bitti, sıfırla
        room.lives = 3;
        room.players[0].x = 0;
        room.players[0].y = 0;
        room.players[1].x = 0;
        room.players[1].y = 1;
        io.to(roomId).emit("gameOver");
      }
      return;
    }

    // Geçerli hareket
    player.x = newX;
    player.y = newY;

    // Buton kontrolü
    if (cellTarget === 3) {
      room.gateOpen = true;
      io.to(roomId).emit("gateUnlocked");
    }

    // Motor (Çıkış) kontrolü - İki oyuncu da ulaştı mı?
    const p1 = room.players[0];
    const p2 = room.players[1];
    if (MAP[p1.y][p1.x] === 9 && MAP[p2.y][p2.x] === 9) {
      io.to(roomId).emit("gameWin");
    } else {
      sendGameState(roomId);
    }
  });

  // Hızlı Komut Gönderimi (Sinyal/Telsiz)
  socket.on("quickCommand", (cmd) => {
    socket.to(roomId).emit("receiveCommand", cmd);
  });

  socket.on("disconnect", () => {
    if (rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (p) => p.id !== socket.id,
      );
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    }
    io.to(roomId).emit("playerLeft");
  });
});

function sendGameState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.players.forEach((p) => {
    // Sadece oyuncunun görmesi gereken duvarları filtrele
    const filteredMap = MAP.map((row) =>
      row.map((cell) => {
        if (cell === 9 || cell === 3 || cell === 4 || cell === 5) return cell;
        if (p.role === "player1" && cell === 1) return 1; // P1 Dikey Duvarı Görür
        if (p.role === "player2" && cell === 2) return 2; // P2 Yatay Duvarı Görür
        return 0;
      }),
    );

    io.to(p.id).emit("gameState", {
      map: filteredMap,
      players: room.players,
      gateOpen: room.gateOpen,
      lives: room.lives,
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Night Riders sunucusu hazır: port ${PORT}`),
);
