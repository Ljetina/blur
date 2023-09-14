import https from 'node:https';
import { getFullConversation } from './db';
import { Message } from '@App/types/model';
import { tokenLimitConversationHistory } from './token';
import { SERVER_ACTION } from '@App/types/ws_actions';

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

interface Function {
  name: string;
  description?: string;
  parameters: object;
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
      // Function handling
      if (c.finish_reason) {
        const functionName = acc.name || c.delta.function_call.name;
        const functionArguments =
          acc.arguments + c.delta.function_call.arguments;
        if (functionName && functionArguments) {
          onEvent('start_function', { functionName, functionArguments });
        }
        acc.name = null;
        acc.arguments = '';
      } else {
        const delta = c.delta;
        if (delta.function_call && delta.function_call.name) {
          acc.name = delta.function_call.name;
        }
        if (delta.function_call && delta.function_call.arguments) {
          acc.arguments += delta.function_call.arguments;
        }
      }
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

export async function streamCompletion(
  conversationId: string,
  query: string,
  onEvent: (type: SERVER_ACTION, payload: any) => void
) {
  const { messages, conversation } = await prepareMessages(
    conversationId,
    query
  );
  console.log({ messages });
  const choiceHandler = makeChoiceHandler(onEvent);
  return new Promise((resolve, reject) => {
    startCompletion({
      model: conversation.model_id as 'gpt-4' | 'gpt-3.5-turbo',
      messages: messages,
      onChunk: (c: Chunk) => {
        if (c.choices && c.choices.length > 0) {
          const choice = c.choices[0];
          choiceHandler(choice);
        }
      },
    })
      .then(resolve)
      .catch(reject);
  });
}

export async function prepareMessages(
  conversationId: string,
  query: string
): Promise<{
  messages: Message[];
  conversation: { model_id: string; prompt: string; name?: string | undefined };
}> {
  const conversation = await getFullConversation(conversationId);
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

  let messages: Message[] = conversation.messages as Message[];

  if (!messages.some((message) => message.role === 'system')) {
    // If not, prepend the system message
    messages = (
      [{ role: 'system', content: conversation.prompt }] as Message[]
    ).concat(messages);
  }

  messages = messages.map((m: Message): Message => {
    const d: Message = {
      role: m.role,
      content: m.compressed_content || m.content,
    };
    if (m.role === 'function') {
      d.name = m.name;
    }
    return d;
  });
  messages.push({ role: 'user', content: query });
  messages = tokenLimitConversationHistory(messages, tokenConversationBudget);

  return { messages, conversation };
}

export async function startCompletion({
  model = 'gpt-3.5-turbo',
  messages,
  functions,
  onChunk,
}: {
  model: 'gpt-3.5-turbo' | 'gpt-4';
  messages: Message[];
  functions?: Function[];
  onChunk: (chunk: Chunk) => void;
}) {
  return new Promise((resolve, reject) => {
    let hasAnnouncedEnd = false;
    const req = https.request(options, (res) => {
      console.log('statusCode:', res.statusCode);
      console.log('headers:', res.headers);
      res.on('close', () => {
        if (!hasAnnouncedEnd) {
          hasAnnouncedEnd = true;
          resolve(null);
        }
      });
      res.on('end', () => {
        if (!hasAnnouncedEnd) {
          hasAnnouncedEnd = true;
          resolve(null);
        }
      });
      res.on('data', (d) => {
        const rawChunk = d.toString('utf-8');
        const lines = rawChunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6, line.length);
            if (!payload.startsWith('[DONE]')) {
              onChunk(JSON.parse(payload));
              // console.log(JSON.parse(payload));
            } else {
              if (!hasAnnouncedEnd) {
                hasAnnouncedEnd = true;
                resolve(null);
              }
            }
          } else if (line.length > 0) {
            console.log('non data chunk', line);
          } else {
            // skip
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
        stream: true,
      })
    );
    req.end();
  });
}
