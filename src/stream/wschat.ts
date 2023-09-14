import WebSocket, { WebSocketServer } from 'ws';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
// import { PassthroughStream } from '@App/lib/passthroughStream';
import { SERVER_ACTION, USER_ACTION } from '@App/types/ws_actions';
import { streamCompletion } from '../lib/openai';
import { storeMessage } from '../lib/db';

export function startWsServer() {
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

  const connections: Record<string, WebSocket> = {};

  wss.on('connection', (ws, req: Request) => {
    console.log('ws connection opened');
    // Parse the URL to get the conversation ID
    const pathName = url.parse(req.url).pathname;
    // const conversationId = pathName?.split('/').pop();
    const conversationId: string = '488f3c07-1f94-4c48-b124-d0c57ea3cdc6';

    ws.on('close', (code, reason) => {
      console.log(
        `WebSocket connection closed by the client. Code: ${code}, Reason: ${reason}`
      );
    });

    ws.on('message', async (message: Buffer) => {
      const stringMessage = message.toString('utf-8');
      console.log('on message', stringMessage);
      const { action, text } = JSON.parse(stringMessage);
      const userAction = action as USER_ACTION;
      if (userAction === 'create_message') {
        // Send a response back to the client
        const userUuid = uuidv4();
        const assistantUuid = uuidv4();
        ws.send(makeResponse('message_ack', { userUuid, assistantUuid }));

        try {
          await streamCompletion(
            conversationId,
            text,
            async (type, payload) => {
              if (type == 'append_to_message') {
                ws.send(makeResponse(type, payload));
              } else if (type == 'response_done') {
                // todo store message
                ws.send(makeResponse(type));
                console.log({ payload });
                await Promise.all([
                  storeMessage({
                    conversation_id: conversationId,
                    message_id: userUuid,
                    role: 'user',
                    message_content: text,
                  }),
                  storeMessage({
                    conversation_id: conversationId,
                    message_id: assistantUuid,
                    role: 'assistant',
                    message_content: payload,
                  }),
                ]);
              }
            }
          );
        } catch (e) {
          console.error(e);
        }
      }
    });
  });
}

function makeResponse(type: SERVER_ACTION, data?: any) {
  return JSON.stringify({ type, data });
}
