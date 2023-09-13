import WebSocket, { WebSocketServer } from 'ws';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import { PassthroughStream } from '@App/lib/passthroughStream';

const wss = new WebSocketServer({
  port: 8080,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024, // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  },
});

wss.on('connection', (ws, req: Request) => {
  // Parse the URL to get the conversation ID
  const pathName = url.parse(req.url).pathname;
  // const conversationId = pathName?.split('/').pop();
  const conversationId = '488f3c07-1f94-4c48-b124-d0c57ea3cdc6';

  ws.on('message', (message) => {
    const stringMessage = message.toString('utf-8');
    const { action, text } = JSON.parse(stringMessage);
    const userAction = action as USER_ACTION;
    if (userAction === 'create_message') {
      // Send a response back to the client
      const userUuid = uuidv4();
      const assistantUuid = uuidv4();
      ws.send(makeResponse('MESSAGE_ACK', { userUuid, assistantUuid }));

      // PassthroughStream(conversationId as string, 'Hello there').then((stream) => {
      //   stream.on('readable', () => {
      //     let chunk;
      //     while (null !== (chunk = stream.read())) {
      //       // Send each chunk to the client as a message
      //       ws.send(chunk.toString());
      //     }
      // });
      ws.send(makeResponse('APPEND_TO_MESSAGE', 'How '));
      ws.send(makeResponse('APPEND_TO_MESSAGE', 'are '));
      ws.send(makeResponse('APPEND_TO_MESSAGE', 'you '));
      ws.send(makeResponse('APPEND_TO_MESSAGE', 'today?'));
      ws.send(makeResponse('RESPONSE_DONE'));
    }
  });
});

type USER_ACTION =
  | 'create_message'
  | 'edit_message'
  | 'confirm'
  | 'reject'
  | 'reload';

type SERVER_ACTION = 'MESSAGE_ACK' | 'APPEND_TO_MESSAGE' | 'REQUEST_CONFIRM' | 'RESPONSE_DONE';

function makeResponse(type: SERVER_ACTION, data?: any) {
  return JSON.stringify({ type, data });
}
