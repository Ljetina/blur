import WebSocket, { WebSocketServer } from 'ws';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import { SERVER_ACTION, USER_ACTION } from '../types/ws_actions';
import { streamCompletion } from '../lib/openai';
import { InputMessage, getConversation, storeMessages } from '../lib/db';
import { FRONTEND_FUNCTIONS } from '../lib/functions';
import { tokensToCredits } from '../lib/pricing';
import { Server } from 'http';
import { verifyClient } from '../lib/auth';

export function startWsServer(server: Server) {
  const wss = new WebSocketServer({
    // port: 8080,
    server,
    verifyClient,
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

  wss.on('connection', async (ws, req: Request) => {
    console.log('ws connection opened');
    // Parse the URL to get the conversation ID
    const pathName = url.parse(req.url).pathname;
    const conversationId = pathName?.split('/').pop() as string;
    const conversation = await getConversation(conversationId);

    let cache: { notebook?: string } = {};
    // const conversationId: string = '488f3c07-1f94-4c48-b124-d0c57ea3cdc6';

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

        const userMessage = {
          conversation_id: conversationId,
          message_id: userUuid,
          role: 'user',
          message_content: text,
        };
        await storeMessages([userMessage]);

        try {
          const usage = await streamCompletion({
            conversation,
            onEvent: makeCompletionHandler(ws, {
              assistantUuid,
              conversationId,
            }),
            cache,
          });
          const credits = tokensToCredits(conversation.model_id, usage);
        } catch (e) {
          console.error('error in streaming primary request', e);
        }
      } else if (userAction === 'notebook_updated') {
        cache['notebook'] = text;
      } else if (userAction === 'frontend_function_result') {
        const functionUuid = uuidv4();
        const responseAssistantUuid = uuidv4();
        const data = JSON.parse(text);
        console.log(new Date(), 'storing function result', data);
        await storeMessages([
          {
            conversation_id: conversationId,
            message_id: functionUuid,
            role: 'function',
            message_content: data.content,
            name: data.name,
          },
        ]);
        try {
          const usage = await streamCompletion({
            conversation,
            onEvent: makeCompletionHandler(ws, {
              conversationId,
              assistantUuid: responseAssistantUuid,
            }),
            cache,
          });
          const credits = tokensToCredits(conversation.model_id, usage);
        } catch (e) {
          console.error('error in streaming follow up assistant request', e);
        }
      }
    });
  });
}

function makeResponse(type: SERVER_ACTION, data?: any) {
  return JSON.stringify({ type, data });
}

function makeCompletionHandler(
  ws: WebSocket,
  {
    conversationId,
    // userMessage,
    assistantUuid,
  }: {
    conversationId: string;
    // userMessage?: InputMessage;
    assistantUuid: string;
  }
): (type: SERVER_ACTION, payload: any) => void {
  return async (type, payload) => {
    if (type == 'append_to_message') {
      ws.send(makeResponse(type, payload));
    } else if (type == 'response_done') {
      ws.send(makeResponse(type));
      // console.log({ payload });
      const assistantMessage = {
        conversation_id: conversationId,
        message_id: assistantUuid,
        role: 'assistant',
        message_content: payload,
      };
      await storeMessages([assistantMessage]);
    } else if (type == 'start_function') {
      if (FRONTEND_FUNCTIONS.includes(payload.functionName)) {
        console.log(
          new Date(),
          'storing assistant message with function payload'
        );
        const assistantMessage: InputMessage = {
          conversation_id: conversationId,
          message_id: assistantUuid,
          role: 'assistant',
          function_name: payload.functionName,
          function_arguments: payload.functionArguments,
          name: payload.functionName,
          message_content: 'Called function ' + payload.functionName,
        };

        await storeMessages([assistantMessage]);
        ws.send(makeResponse('start_frontend_function', payload));
      } else {
        ws.send(makeResponse('start_function', payload));
      }
    } else if (type === 'response_error') {
      ws.send(makeResponse('response_error', payload));
    }
  };
}
