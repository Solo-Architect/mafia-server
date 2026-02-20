const WebSocket = require('ws');

const server = new WebSocket.Server({ port: process.env.PORT || 8080 });
const games = {};

server.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    if (data.type === 'create') {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      games[code] = {
        players: [{ name: data.name, id: ws._socket.remoteAddress }]
      };
      ws.send(JSON.stringify({ type: 'created', code }));
    }
    
    if (data.type === 'join') {
      const game = games[data.code];
      if (game) {
        game.players.push({ name: data.name, id: ws._socket.remoteAddress });
        ws.send(JSON.stringify({ type: 'joined', players: game.players.map(p => p.name) }));
        
        // Уведомляем всех в комнате
        server.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
              type: 'update', 
              players: game.players.map(p => p.name) 
            }));
          }
        });
      }
    }
  });
});

console.log('✅ Server started');
