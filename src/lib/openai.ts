import https from 'node:https';
import { getFullConversation } from './db';
import { Message } from '@App/types/model';
import { tokenLimitConversationHistory } from './token';

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

interface Chunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: 'string';
  choices: {
    index: number;
    delta?: {
      role: 'system' | 'user' | 'assistant';
      content: 'string' | null;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: string | null;
  }[];
}

interface Function {
  name: string;
  description?: string;
  parameters: object;
}

export async function streamCompletion(conversationId: string) {
  const { messages, conversation } = await prepareMessages(conversationId);

  startCompletion({
    model: conversation.model_id as 'gpt-4' | 'gpt-3.5-turbo',
    messages: messages,
    onChunk: (c) => console.log(c),
    // onChunk:
  })
    .then(() => {})
    .catch(() => {});
}

async function prepareMessages(conversationId: string): Promise<{
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

  let messages: Message[] = JSON.parse(conversation.messages);

  const getMessageDict = (m: Message): Message => {
    const d: Message = {
      role: m.role,
      content: m.content || m.content, // replace with actual compressed content condition
    };
    if (m.role === 'function') {
      d.name = m.name;
    }
    return d;
  };

  if (!messages.some((message) => message.role === 'system')) {
    // If not, prepend the system message
    messages = (
      [{ role: 'system', content: conversation.prompt }] as Message[]
    ).concat(messages);
  }

  // Convert message objects to dictionaries
  messages = messages.map(getMessageDict);

  console.log('m', messages);
  messages = tokenLimitConversationHistory(messages, tokenConversationBudget);
  // messages = queryVectorDb(messages, tokenSimilarBudget);

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
