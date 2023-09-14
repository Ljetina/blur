const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/conversation/123');
ws.on('open', () => {
  ws.send(JSON.stringify({ action: 'create_message', text: 'Hello, server!' }));
});
ws.on('message', (message) => {
  const messageObj = JSON.parse(message.toString('utf-8'));
  console.log(new Date());
  console.log(messageObj);
  if (messageObj.type === 'response_done') {
    ws.close();
  }
});

ws.on('close', () => {
  console.log('closed');
});

ws.on('error', (e) => {
  console.error(e);
});
