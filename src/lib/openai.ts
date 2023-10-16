import https from 'node:https';
import { InputMessage, getFullConversationAndNotebook } from './db';
import { DbMessage, FullConversation, Message } from '@App/types/model';
import { tokenLimitConversationHistory } from './token';
import { SERVER_ACTION } from '@App/types/ws_actions';
import { Function, getFunctions } from './functions';
import { datasciencePrompt, defaultPrompt } from './prompts';
import { logger } from './log';

const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    Authorization: 'Bearer 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',
    'Content-type': 'application/json',
  },
};

interface Choice {
  index: number;
  delta?: {
    role?: 'system' | 'user' | 'assistant';
    content?: string | null;
    function_call?: {
      name: string;
      arguments: string;
    };
  };
  finish_reason: string | null;
}
interface Chunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: 'string';
  choices?: Choice[];
}

export const makeChoiceHandler = (
  onEvent: (type: SERVER_ACTION, payload?: any) => void
) => {
  const acc: { name: string | null; arguments: string; content: '' } = {
    name: null,
    arguments: '',
    content: '',
  };
  return (c: Choice) => {
    if (c.delta && c.delta.function_call) {
      const delta = c.delta;
      if (delta.function_call && delta.function_call.name) {
        acc.name = delta.function_call.name;
      }
      if (delta.function_call && delta.function_call.arguments) {
        acc.arguments += delta.function_call.arguments;
      }
    } else if (c.delta && c.finish_reason === 'function_call') {
      if (acc.name && acc.arguments) {
        onEvent('start_function', {
          functionName: acc.name,
          functionArguments: acc.arguments,
        });
      }
      acc.name = null;
      acc.arguments = '';
    } else if (c.delta && !c.delta?.function_call) {
      // Message delta handling
      if (c.finish_reason) {
        onEvent('response_done', acc.content);
        acc.content = '';
      } else {
        acc.content += c.delta.content;
        onEvent('append_to_message', c.delta.content);
      }
    }
  };
};

export async function streamCompletion({
  conversationId,
  onEvent,
  // query,
  cache,
}: {
  conversationId: string;
  onEvent: (type: SERVER_ACTION, payload: any) => void;
  // query?: string;
  cache?: any;
}) {
  console.log({ cache });
  const { messages, conversation } = await prepareMessages(
    conversationId,
    // query,
    cache['notebook']
  );

  const functions = await getFunctions({ conversation });
  // console.log('last message');
  // console.log(messages[messages.length - 1]);
  // console.log('last message');
  // console.log(messages);

  const choiceHandler = makeChoiceHandler(onEvent);
  return new Promise((resolve, reject) => {
    startCompletion({
      model: conversation.model_id as 'gpt-4' | 'gpt-3.5-turbo',
      messages: messages,
      functions: functions,
      onChunk: (c: Chunk) => {
        if (c.choices && c.choices.length > 0) {
          const choice = c.choices[0];
          choiceHandler(choice);
        }
      },
      onError: (e) => {
        onEvent('response_error', { message: 'error handling request' });
      },
    })
      .then(resolve)
      .catch(reject);
  });
}

export async function prepareMessages(
  conversationId: string,
  query?: string,
  systemExtra?: string
): Promise<{
  messages: Message[];
  conversation: FullConversation;
}> {
  const conversation = await getFullConversationAndNotebook(conversationId);

  let tokenConversationBudget: number;
  let tokenSimilarBudget: number;

  if (conversation.model_id === 'gpt-3.5-turbo') {
    tokenConversationBudget = 1500;
    tokenSimilarBudget = 500;
  } else if (conversation.model_id === 'gpt-4') {
    tokenConversationBudget = 4000;
    tokenSimilarBudget = 1000;
  } else {
    tokenConversationBudget = 2000;
    tokenSimilarBudget = 500;
  }

  let messages: Message[] = conversation.messages.map((i: DbMessage) => {
    const message: Message = {
      role: i.role,
      content: null,
    };
    if (i.function_name) {
      message.function_call = {
        name: i.function_name as string,
        arguments: i.function_arguments as string,
      };
      message.content = null;
    } else {
      message.content = i.content || i.compressed_content || '';
    }
    if (i.name) {
      message.name = i.name;
    }
    return message;
  });
  const prompt = conversation.notebook
    ? datasciencePrompt + systemExtra
    : defaultPrompt;
  messages = ([{ role: 'system', content: prompt }] as Message[]).concat(
    messages
  );

  if (query) {
    messages.push({ role: 'user', content: query });
  }
  messages = tokenLimitConversationHistory(messages, tokenConversationBudget);
  console.log(messages[0])
  console.log('!!!!')
  console.log(
    JSON.stringify(messages)
    // JSON.stringify(messages.map((m) => `${m.role}: ${m.content?.substring(0, 100)}`))
  );
  // JSON.stringify(messages.map((m) => `${m.role}: ${m.content?.substring(0, 100)}`))

  return { messages, conversation };
}

export async function startCompletion({
  model = 'gpt-3.5-turbo',
  messages,
  functions,
  onChunk,
  onError,
}: {
  model: 'gpt-3.5-turbo' | 'gpt-4';
  messages: Message[];
  functions?: Function[];
  onChunk: (chunk: Chunk) => void;
  onError: (e: any) => void;
}) {
  console.log({ messages });
  return new Promise((resolve, reject) => {
    let hasAnnouncedEnd = false;
    let nonDataChunks: string[] = [];
    const req = https.request(options, (res) => {
      // console.log('statusCode:', res.statusCode);
      res.on('close', () => {
        console.log('openai close');
        if (!hasAnnouncedEnd) {
          hasAnnouncedEnd = true;
          resolve(null);
        }
      });
      res.on('end', () => {
        console.log('openai end');
        if (!hasAnnouncedEnd) {
          hasAnnouncedEnd = true;
          resolve(null);
        }
      });
      res.on('data', (d) => {
        const rawChunk = d.toString('utf-8');
        // JSON.parse(rawChunk)
        // console.log('openai data', rawChunk);
        const lines = rawChunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6, line.length);
            // console.log({ payload });
            if (!payload.startsWith('[DONE]')) {
              try {
                const message = JSON.parse(payload);
                if (message.error) {
                  console.error(new Date(), 'openai error', message.error);
                  onError(message.error);
                } else {
                  onChunk(message);
                }
              } catch (e) {
                logger.error('error parsing data chunk as json', e);
              }
            } else {
              if (!hasAnnouncedEnd) {
                hasAnnouncedEnd = true;
                resolve(null);
              }
            }
          } else if (line.length > 0) {
            console.log('non data chunk', line);
            nonDataChunks.push(line);
          } else if (nonDataChunks.length > 0) {
            console.log('empty line');
            const joinedChunks = nonDataChunks.join('\n');
            try {
              const parsedJSON = JSON.parse(joinedChunks);
              if (parsedJSON.error) {
                onError(parsedJSON.error);
              }
            } catch (e) {
              logger.error('error parsing non-data chunk as json', e);
            }
            nonDataChunks = [];
          }
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });
    req.write(
      JSON.stringify({
        model,
        messages,
        functions,
        stream: true,
      })
    );
    req.end();
  });
}
