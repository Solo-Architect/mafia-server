const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

// Хранилище игр на сервере
const games = {};

// Функция для рассылки всем в комнате
function broadcastToRoom(roomCode, message) {
  if (!games[roomCode]) return;
  
  games[roomCode].players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  });
}

server.on('connection', (ws) => {
  console.log('🟢 Новый игрок подключился');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('📩 Получено:', data);

    // СОЗДАНИЕ ИГРЫ
    if (data.type === 'create') {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      games[roomCode] = {
        players: [{ name: data.playerName, ws, isHost: true }],
        status: 'waiting',
        roles: {},
        phase: 'lobby',
        votes: {}
      };
      
      ws.send(JSON.stringify({ 
        type: 'created', 
        roomCode,
        players: games[roomCode].players.map(p => p.name)
      }));
      
      console.log(`✅ Комната ${roomCode} создана игроком ${data.playerName}`);
    }

    // ПОДКЛЮЧЕНИЕ К ИГРЕ
    if (data.type === 'join') {
      const game = games[data.roomCode];
      
      if (!game) {
        ws.send(JSON.stringify({ type: 'error', message: 'Игра не найдена' }));
        return;
      }
      
      game.players.push({ name: data.playerName, ws, isHost: false });
      
      // Отправляем подтверждение вошедшему
      ws.send(JSON.stringify({ 
        type: 'joined', 
        roomCode: data.roomCode,
        players: game.players.map(p => p.name)
      }));
      
      // Оповещаем всех в комнате
      broadcastToRoom(data.roomCode, {
        type: 'playersUpdate',
        players: game.players.map(p => p.name)
      });
      
      console.log(`👤 ${data.playerName} подключился к ${data.roomCode}`);
    }

    // СТАРТ ИГРЫ (назначение ролей)
    if (data.type === 'start') {
      const game = games[data.roomCode];
      if (!game) return;
      
      const roles = ['Мафия', 'Мафия', 'Шериф', 'Доктор', 'Мирный', 'Мирный'];
      const shuffled = [...roles].sort(() => Math.random() - 0.5);
      
      game.players.forEach((player, index) => {
        game.roles[player.name] = shuffled[index % shuffled.length];
      });
      
      game.status = 'playing';
      game.phase = 'night';
      
      // Отправляем каждому его роль
      game.players.forEach(player => {
        player.ws.send(JSON.stringify({
          type: 'roleAssigned',
          role: game.roles[player.name]
        }));
      });
      
      // Оповещаем о начале игры
      broadcastToRoom(data.roomCode, {
        type: 'gameStarted',
        phase: 'night'
      });
      
      console.log(`🎮 Игра в ${data.roomCode} началась`);
    }

    // НОЧНЫЕ ДЕЙСТВИЯ
    if (data.type === 'nightAction') {
      const game = games[data.roomCode];
      if (!game) return;
      
      // Сохраняем действие
      if (!game.nightActions) game.nightActions = {};
      game.nightActions[data.playerName] = data.action;
      
      // Проверяем, все ли сделали ход
      const mafiaPlayers = game.players.filter(p => 
        game.roles[p.name] === 'Мафия' && p.ws.readyState === WebSocket.OPEN
      );
      
      if (Object.keys(game.nightActions).length >= mafiaPlayers.length) {
        // Подсчёт результатов
        let killed = null;
        // ... логика подсчёта
        
        broadcastToRoom(data.roomCode, {
          type: 'nightResult',
          killed: killed
        });
        
        game.phase = 'day';
        game.nightActions = {};
      }
    }

    // ГОЛОСОВАНИЕ
    if (data.type === 'vote') {
      const game = games[data.roomCode];
      if (!game) return;
      
      if (!game.votes) game.votes = {};
      game.votes[data.playerName] = data.target;
      
      // Проверяем, все ли проголосовали
      const alivePlayers = game.players.filter(p => 
        game.roles[p.name] !== 'dead'
      );
      
      if (Object.keys(game.votes).length >= alivePlayers.length) {
        // Подсчёт голосов
        const voteCount = {};
        Object.values(game.votes).forEach(target => {
          voteCount[target] = (voteCount[target] || 0) + 1;
        });
        
        let maxVotes = 0;
        let eliminated = null;
        Object.entries(voteCount).forEach(([player, count]) => {
          if (count > maxVotes) {
            maxVotes = count;
            eliminated = player;
          }
        });
        
        broadcastToRoom(data.roomCode, {
          type: 'votingResult',
          eliminated: eliminated,
          votes: voteCount
        });
        
        game.phase = 'night';
        game.votes = {};
      }
    }
  });

  ws.on('close', () => {
    console.log('🔴 Игрок отключился');
    // Удаляем игрока из всех игр
    Object.keys(games).forEach(roomCode => {
      const game = games[roomCode];
      const playerIndex = game.players.findIndex(p => p.ws === ws);
      
      if (playerIndex !== -1) {
        game.players.splice(playerIndex, 1);
        
        // Если игроков не осталось — удаляем игру
        if (game.players.length === 0) {
          delete games[roomCode];
          console.log(`🗑️ Игра ${roomCode} удалена`);
        } else {
          // Иначе оповещаем оставшихся
          broadcastToRoom(roomCode, {
            type: 'playersUpdate',
            players: game.players.map(p => p.name)
          });
        }
      }
    });
  });
});

console.log(`🚀 Сервер запущен на порту ${process.env.PORT || 8080}`);
