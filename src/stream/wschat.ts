import WebSocket, { WebSocketServer } from 'ws';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import { SERVER_ACTION, USER_ACTION } from '../types/ws_actions';
import { streamCompletion } from '../lib/openai';
import {
  InputMessage,
  deleteNewerMessages,
  getConversation,
  storeApiUsage,
  storeMessages,
  updateSystemMemory,
} from '../lib/db';
import { FRONTEND_FUNCTIONS } from '../lib/functions';
import { RequestUsage, tokensToCredits } from '../lib/pricing';
import { Server } from 'http';
import { verifyClient } from '../lib/auth';
import { Conversation } from '@App/types/model';
import { logger } from '../lib/log';

const tenantConnections: Record<string, WebSocket> = {};
const conversationConnections: Record<string, WebSocket> = {};

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

  function cleanUpRecords(conversationId: string, tenantId: string) {
    delete conversationConnections[conversationId];
    if (tenantConnections[conversationId]) {
      delete tenantConnections[conversationId];
    }
    if (conversationConnections[conversationId]) {
      delete conversationConnections[conversationId];
    }
  }

  wss.on('connection', async (ws, req: Request) => {
    console.log('ws connection opened');
    // Parse the URL to get the conversation ID
    const pathName = url.parse(req.url).pathname;
    const conversationId = pathName?.split('/').pop() as string;
    conversationConnections[conversationId] = ws;
    // @ts-ignore
    const tenantId = req.tenant_id;
    tenantConnections[tenantId] = ws;
    const flags = { hasAborted: false, shouldAbort: false };

    ws.on('ping', () => {
      console.log('Received ping from client');
    });

    let cache: { notebook?: string } = {};

    ws.on('close', (code, reason) => {
      console.log(
        `WebSocket connection closed by the client. Code: ${code}, Reason: ${reason}`
      );
      cleanUpRecords(conversationId, tenantId);
    });
    ws.on('error', () => {
      cleanUpRecords(conversationId, tenantId);
    });

    ws.on('message', async (message: Buffer) => {
      const stringMessage = message.toString('utf-8');
      if (stringMessage === 'ping') {
        ws.send('pong');
        return;
      }
      const { action, text } = JSON.parse(stringMessage);
      const userAction = action as USER_ACTION;

      if (userAction === 'regenerate_message') {
        const conversation = await getConversation(conversationId);
        await deleteNewerMessages(text, conversationId);
        const assistantUuid = uuidv4();
        ws.send(
          makeResponse('message_regenerate_ack', {
            userUuid: text,
            assistantUuid,
          })
        );
        try {
          const usage = await streamCompletion({
            conversation,
            onEvent: makeCompletionHandler(ws, {
              assistantUuid,
              conversationId,
            }),
            cache,
            flags,
          });
          conversation.tenant_credits = await handleUsage(
            conversation,
            usage,
            ws
          );
        } catch (e) {
          console.error('error in streaming regenerate request', e);
        }
      } else if (userAction === 'create_message') {
        const conversation = await getConversation(conversationId);
        if (conversation.tenant_credits < 100) {
          console.log('sending out of credits');
          ws.send(makeResponse('out_of_credits', null));
          return;
        }
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
            flags,
          });
          conversation.tenant_credits = await handleUsage(
            conversation,
            usage,
            ws
          );
        } catch (e) {
          console.error('error in streaming primary request', e);
        }
      } else if (userAction === 'notebook_updated') {
        cache['notebook'] = text;
      } else if (userAction === 'frontend_function_result') {
        const conversation = await getConversation(conversationId);
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
            flags,
          });
          conversation.tenant_credits = await handleUsage(
            conversation,
            usage,
            ws
          );
        } catch (e) {
          console.error('error in streaming follow up assistant request', e);
        }
      } else if (userAction === 'abort') {
        flags.shouldAbort = true;
        ws.send(makeResponse('response_done'));
      }
    });
  });
}

export async function invoicePaymentReceived({
  tenantId,
  credits,
}: {
  tenantId: string;
  credits: number;
}) {
  if (tenantConnections[tenantId]) {
    const ws = tenantConnections[tenantId];
    ws.send(makeResponse('credit_topup', { remainingCredits: credits }));
  }
}

async function handleUsage(
  conversation: Conversation,
  usage: RequestUsage,
  ws: WebSocket
) {
  const credits = tokensToCredits(conversation.model_id, usage);
  const remaining = await storeApiUsage({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    user_id: conversation.user_id,
    completion_tokens: usage.completionTokens,
    prompt_tokens: usage.promptTokens,
    credits: credits,
  });

  ws.send(
    makeResponse('remaining_credits', { remainingCredits: remaining.credits })
  );
  return remaining;
}

function makeResponse(type: SERVER_ACTION, data?: any) {
  return JSON.stringify({ type, data });
}

function makeCompletionHandler(
  ws: WebSocket,
  {
    conversationId,
    assistantUuid,
  }: {
    conversationId: string;
    assistantUuid: string;
  }
): (type: SERVER_ACTION, payload: any) => void {
  return async (type, payload) => {
    if (type == 'append_to_message') {
      sendAndLog(ws, 'append_to_message', payload);
    } else if (type == 'response_done') {
      sendAndLog(ws, 'response_done');
      const assistantMessage = {
        conversation_id: conversationId,
        message_id: assistantUuid,
        role: 'assistant',
        message_content: payload,
      };
      await storeMessages([assistantMessage]);
    } else if (type == 'start_function') {
      if (FRONTEND_FUNCTIONS.includes(payload.functionName)) {
        logger.info('storing assistant message with function payload');
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
        sendAndLog(ws, 'start_frontend_function', payload);
      } else {
        if (payload.functionName == 'update_memory') {
          await updateSystemMemory(
            conversationId,
            JSON.parse(payload.functionArguments).value
          );
        }
        sendAndLog(ws, 'start_function', payload);
      }
    } else if (type === 'response_error') {
      sendAndLog(ws, 'response_error', payload);
    }
  };
}

function sendAndLog(ws: WebSocket, action: SERVER_ACTION, payload?: any) {
  const toSend = makeResponse(action, payload);
  if (process.env.NODE_ENV !== 'production') {
    logger.info(toSend);
  }
  ws.send(toSend);
}
