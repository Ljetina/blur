import https from 'node:https';
import fs from 'node:fs';
import { getMessagesForPrompt } from './db';
import { Conversation, DbMessage, Message } from '@App/types/model';
import {
  countInputTokens,
  countTokens,
  tokenLimitConversationHistory,
} from './token';
import { SERVER_ACTION } from '@App/types/ws_actions';
import { Function, getFunctions } from './functions';
import {
  addConversationMemory,
  addNotebook,
  datasciencePrompt,
  defaultPrompt,
} from './prompts';
import { logger } from './log';
import { RequestUsage } from './pricing';

const openAIOptions = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    Authorization: process.env.OPENAI_API_KEY,
    'Content-type': 'application/json',
  },
};

const groqOptions = {
  hostname: 'api.groq.com',
  port: 443,
  path: '/openai/v1/chat/completions',
  method: 'POST',
  headers: {
    Authorization: process.env.GROQ_API_KEY,
    'Content-type': 'application/json',
  },
};

const getOptions = (model_id: String) => model_id.startsWith('llama3') ? groqOptions : openAIOptions;

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
  finish_details?: unknown;
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
      let funcArgs = acc.arguments;
      if (acc.name && acc.arguments) {
        if (['add_cell', 'update_cell'].includes(acc.name)) {
          try {
            // Replace newlines within the matched string for "code"
            let result = acc.arguments.replace(
              /("code":\s*")([\s\S]*?)(")/g,
              function (match, p1, p2, p3) {
                // Replace newlines within the second group (p2) only
                let replacedNewlines = p2.replace(/\n/g, '\\n');
                // Return the modified string with escaped newlines
                return p1 + replacedNewlines + p3;
              }
            );
            JSON.parse(result);
            funcArgs = result;
          } catch (e) {
            console.log('unparseable arguments', acc.arguments);
            if (acc.name === 'add_cell') {
              let result = acc.arguments.replace(
                /("code":\s*")([\s\S]*?)(")/g,
                function (match, p1, p2, p3) {
                  // Replace newlines within the second group (p2) only
                  let replacedNewlines = p2.replace(/\n/g, '\\n');
                  // Return the modified string with escaped newlines
                  return p1 + replacedNewlines + p3;
                }
              );
              funcArgs = JSON.stringify({ source: result, cell_type: 'code' });
            }
          }
        }
        onEvent('start_function', {
          functionName: acc.name,
          functionArguments: funcArgs,
        });
      }
      acc.name = null;
      acc.arguments = '';
    } else if (c.delta && !c.delta?.function_call) {
      // Message delta handling
      if (c.finish_reason || c.finish_details) {
        onEvent('response_done', acc.content);
        acc.content = '';
      } else if (c.delta.content) {
        acc.content += c.delta.content;
        onEvent('append_to_message', c.delta.content);
      }
    }
  };
};

export async function streamImageInterpretation({
  conversation,
  image,
  onEvent,
  cache,
  flags,
}: {
  conversation: Conversation;
  image: string;
  cache?: any;
  onEvent: (type: SERVER_ACTION, payload: any) => void;
  flags: { shouldAbort: boolean; hasAborted: boolean };
}) {
  const { messages } = await prepareMessages(
    conversation,
    (addConversationMemory(conversation.system_memory) || '') +
      (addNotebook(cache['notebook']) || ''),
    true // forVision
  );

  const interpretationUserMesssage = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Given the context of the preceding conversation, what is the best short text description of the below chart or image?',
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${image}`,
        },
      },
    ],
  };

  const choiceHandler = makeChoiceHandler(onEvent);
  return new Promise((resolve, reject) => {
    startCompletion({
      model: 'gpt-4-vision-preview',
      messages: messages.concat([interpretationUserMesssage]),
      // functions: [],
      user: conversation.tenant_id,
      temperature: conversation.temperature,
      onChunk: (c: Chunk) => {
        if (c.choices && c.choices.length > 0) {
          const choice = c.choices[0];
          choiceHandler(choice);
        }
      },
      onError: (e) => {
        onEvent('response_error', { message: 'error handling request' });
        reject(e);
      },
      flags,
    })
      .then(resolve)
      .catch(reject);
  });
}

export async function streamCompletion({
  conversation,
  onEvent,
  cache,
  flags,
}: {
  conversation: Conversation;
  onEvent: (type: SERVER_ACTION, payload: any) => void;
  cache?: any;
  flags: { shouldAbort: boolean; hasAborted: boolean };
}): Promise<{ promptTokens: number; completionTokens: number }> {
  const { messages } = await prepareMessages(
    conversation,
    (addConversationMemory(conversation.system_memory) || '') +
      (addNotebook(cache['notebook']) || '')
  );

  const functions = await getFunctions({ conversation });

  const choiceHandler = makeChoiceHandler(onEvent);
  return new Promise((resolve, reject) => {
    startCompletion({
      model: conversation.model_id as 'gpt-4' | 'gpt-3.5-turbo',
      messages: messages,
      functions: functions,
      user: conversation.tenant_id,
      temperature: conversation.temperature,
      onChunk: (c: Chunk) => {
        if (c.choices && c.choices.length > 0) {
          const choice = c.choices[0];
          choiceHandler(choice);
        }
      },
      onError: (e) => {
        onEvent('response_error', { message: 'error handling request' });
        reject(e);
      },
      flags,
    })
      .then(resolve)
      .catch(reject);
  });
}

export async function prepareMessages(
  conversation: Conversation,
  systemExtra?: string,
  forVision = false
): Promise<{
  messages: Message[];
}> {
  const messages = await getMessagesForPrompt(conversation.id);
  let tokenConversationBudget: number;
  let tokenSimilarBudget: number;

  if (conversation.model_id === 'gpt-3.5-turbo') {
    tokenConversationBudget = 1500;
    tokenSimilarBudget = 500;
  } else if (conversation.model_id === 'gpt-4') {
    tokenConversationBudget = 2000;
    tokenSimilarBudget = 1000;
  } else if (conversation.model_id === 'gpt-4-1106-preview') {
    tokenConversationBudget = 10000;
    tokenSimilarBudget = 0;
  } else {
    tokenConversationBudget = 2000;
    tokenSimilarBudget = 500;
  }

  let promptMessages: Message[] = messages
    .filter((i: DbMessage) => {
      if (forVision) {
        return !i.name && !i.function_name;
      } else {
        return true;
      }
    })
    .map((i: DbMessage) => {
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

  // const firstMessage = promptMessages[0];
  // promptMessages.reverse()
  // for (let i = 0; i < promptMessages.length; ++i) {

  // }

  // promptMessages.reverse()
  // console.log({ conversation });
  const prompt = conversation.notebook_name
    ? datasciencePrompt + systemExtra
    : defaultPrompt;
  console.log('prompt size', countTokens(prompt));
  promptMessages = ([{ role: 'system', content: prompt }] as Message[]).concat(
    promptMessages
  );

  // logger.info('SYSTEM', prompt);

  promptMessages = tokenLimitConversationHistory(
    promptMessages,
    tokenConversationBudget
  );
  // console.log(messages[0]);
  // console.log('!!!!');
  // console.log(
  // JSON.stringify(messages)
  // JSON.stringify(messages.map((m) => `${m.role}: ${m.content?.substring(0, 100)}`))
  // );
  // JSON.stringify(messages.map((m) => `${m.role}: ${m.content?.substring(0, 100)}`))

  return { messages: promptMessages };
}

export async function startCompletion({
  model = 'gpt-3.5-turbo',
  messages,
  functions,
  user,
  temperature,
  onChunk,
  onError,
  flags,
  max_tokens = 4096,
}: {
  model:
    | 'gpt-3.5-turbo'
    | 'gpt-4'
    | 'gpt-4-1106-preview'
    | 'gpt-4-vision-preview'
    | 'llama3-8b-8192'
    | 'llama3-70b-8192';
    // | 'mixtral-8x7b-32768'
    // | 'gemma-7b-it';
  messages: Message[];
  functions?: Function[];
  user: string;
  temperature: number;
  onChunk: (chunk: Chunk) => void;
  onError: (e: any) => void;
  flags: { shouldAbort: boolean; hasAborted: boolean };
  max_tokens?: number;
}): Promise<{ promptTokens: number; completionTokens: number }> {
  // console.log({ messages });
  const requestUsage: RequestUsage = {
    promptTokens: countInputTokens(messages, functions),
    completionTokens: 0,
  };
  return new Promise((resolve, reject) => {
    let hasAnnouncedEnd = false;
    let nonDataChunks: string[] = [];

    function announceEnd() {
      if (!hasAnnouncedEnd) {
        hasAnnouncedEnd = true;
        resolve(requestUsage);
      }
    }
    const options = getOptions(model);
    const req = https.request(options, (res) => {
      // console.log('status', res.statusCode, res.headers);
      const contentType = res.headers['content-type'];

      // NON SSE handlers, mostly for errors
      if (contentType?.includes('application/json')) {
        console.log('json');
        const chunks: Buffer[] = [];
        res.on('data', (d) => {
          chunks.push(d);
        });
        res.on('end', () => {
          const parsedJson = JSON.parse(
            chunks.map((b) => b.toString('utf-8')).join('')
          );
          if (parsedJson.error) {
            onError(parsedJson.error);
          }
          announceEnd();
        });
      } else if (contentType?.includes('text/event-stream')) {
        // console.log('sse');
        let buffer = '';
        // console.log('statusCode:', res.statusCode);
        res.on('close', () => {
          console.log('openai close');
          announceEnd();
        });
        res.on('end', () => {
          console.log('openai end');
          announceEnd();
        });
        res.on('data', (d) => {
          // console.log('data start', d.toString('utf-8'));
          if (flags.shouldAbort && !flags.hasAborted) {
            flags.hasAborted = true;
            announceEnd();
          }
          const rawChunk = d.toString('utf-8');
          buffer += rawChunk;
          let endOfMessageIndex = buffer.indexOf('\n\n');
          while (endOfMessageIndex !== -1) {
            const rawMessage = buffer.substring(0, endOfMessageIndex);
            buffer = buffer.substring(endOfMessageIndex + 2); // +2 to remove the newline characters

            if (rawMessage.startsWith('data: ')) {
              const payload = rawMessage.slice(6, rawMessage.length);
              // console.log({ payload });
              if (!payload.startsWith('[DONE]')) {
                requestUsage.completionTokens += 1;
                try {
                  const message = JSON.parse(payload);
                  if (message.error) {
                    console.error(new Date(), 'openai error', message.error);
                    onError(message.error);
                  } else {
                    onChunk(message);
                  }
                } catch (e) {
                  logger.info('payload: ', payload);
                  logger.error(
                    'error parsing data chunk as json',
                    e,
                    rawMessage
                  );
                }
              } else {
                announceEnd();
              }
            } else if (rawMessage.length > 0) {
              // console.log('non data chunk', rawMessage);
              nonDataChunks.push(rawMessage);
            } else if (nonDataChunks.length > 0) {
              // console.log('empty line');
              const joinedChunks = nonDataChunks.join('\n');
              try {
                const parsedJSON = JSON.parse(joinedChunks);
                if (parsedJSON.error) {
                  onError(parsedJSON.error);
                }
              } catch (e) {
                logger.error(
                  'error parsing non-data chunk as json',
                  e,
                  joinedChunks
                );
              }
              nonDataChunks = [];
            }
            endOfMessageIndex = buffer.indexOf('\n\n');
          }
        });
      }
    });

    req.on('error', (e) => {
      console.log('on error');
      reject(e);
    });
    const payload = JSON.stringify({
      model,
      messages,
      functions,
      stream: true,
      temperature,
      max_tokens: max_tokens,
      user,
    });
    // fs.writeFileSync('payload.json', payload);
    // logger.info('!!!!!');
    // logger.info(payload);
    // logger.info('!!!!!');
    req.write(payload);
    req.end();
  });
}

export async function startCompletionSimplified(
  payload: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = openAIOptions;
    const req = https.request(options, (res) => {
      res.on('close', () => {
        console.log('openai close');
      });
      res.on('end', () => {
        console.log('openai end');
      });
      res.on('data', (d) => {
        const rawChunk = d.toString('utf-8');
        // console.log('rawChunk', rawChunk);
        const lines = rawChunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataChunk = line.slice(6, line.length);
            if (!dataChunk.startsWith('[DONE]')) {
              // console.log('Data chunk:', dataChunk);
            } else {
              // console.log('DONE');
              resolve();
            }
          }
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request error:', e);
      reject(e);
    });

    // console.log('Payload:');
    // console.log('\n\n\n\n');
    // console.log(payload);
    // console.log('\n\n\n\n');
    req.write(payload);
    req.end();
  });
}
