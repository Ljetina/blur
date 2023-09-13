const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/conversation/123');
ws.on('open', () => {
  ws.send(JSON.stringify({ action: 'create_message', text: 'Hello, server!' }));
});
ws.on('message', (message) => {
  console.log(JSON.parse(message.toString('utf-8')));
  ws.close();
});
