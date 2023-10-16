import axios, { AxiosError } from 'axios';
import https from 'node:https';
import 'dotenv/config';
import tiktoken from 'tiktoken-node';
import { Function, getFunctions } from './lib/functions';
import { prepareMessages } from './lib/openai';
import { Message } from './types/model';

const encoding = tiktoken.getEncoding('cl100k_base');

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

const headers = {
  Authorization: 'Bearer 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',
  'Content-type': 'application/json',
};

async function callConversationCompletion(
  conversationId: string,
  notebook?: string
) {
  const { messages, conversation } = await prepareMessages(
    conversationId,
    // query,
    notebook
  );

  const functions = await getFunctions({ conversation });

  await startCompletion({
    model: conversation.model_id as any,
    messages,
    functions: functions,
    streaming: false,
  });
}

async function startCompletion({
  model = 'gpt-3.5-turbo',
  messages,
  functions,
  streaming = false,
}: {
  model: 'gpt-3.5-turbo' | 'gpt-4';
  messages: Message[];
  functions?: Function[];
  streaming: boolean;
}) {
  try {
    // Count tokens in messages
    let messageTokenCount = 0;
    for (const message of messages) {
      messageTokenCount +=
        encoding.encode(message.role + ' ' + message?.content).length + 4;
    }
    messageTokenCount -= messages.length;
    messageTokenCount += 3;
    console.log('messages count', messageTokenCount);
    if (functions) {
      const functionTokenCount = encoding.encode(
        JSON.stringify(functions || '')
      ).length;
      console.log('function token count', functionTokenCount);
      messageTokenCount += functionTokenCount;
      messageTokenCount -= 4;
    }
    console.log(`Internal count: ${messageTokenCount}`);

    if (!streaming) {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model,
          messages,
          functions,
          stream: streaming,
        },
        {
          headers,
        }
      );
      console.log(`OpenAI count: ${response.data.usage.prompt_tokens}`);
      console.log(
        `difference: ${response.data.usage.prompt_tokens - messageTokenCount}`
      );
      console.log(response.data.choices[0].message);
      return response.data.usage.completion_tokens;
    } else {
      let openAiChunks = 0;
      return await new Promise((resolve) => {
        const req = https.request(options, (res) => {
          // console.log('statusCode:', res.statusCode);
          res.on('close', () => {
            console.log('openai close');
          });
          res.on('end', () => {
            console.log('openai end');
          });
          res.on('data', (d) => {
            const rawChunk = d.toString('utf-8');
            // JSON.parse(rawChunk)
            // console.log('openai data', rawChunk);
            const lines = rawChunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const payload = line.slice(6, line.length);
                if (!payload.startsWith('[DONE]')) {
                  console.log(payload);
                  openAiChunks += 1;
                } else {
                  resolve(openAiChunks);
                }
              }
            }
          });
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
  } catch (error) {
    console.error('error');
    if (error instanceof AxiosError) {
      console.log(error.response?.data);
    }
  }
}

// const FIXED_PROMPT =
//   'Translate the following English text to French: "{Hello, world!}"';

const FIXED_PROMPT =
  `Please repeat the content after this line exactly, without confirming\n` +
  "In twilight's embrace, the day takes its leave,\n" +
  'As golden hues paint the heavens above.\n' +
  'The stars awaken, and with soft breath, breathe\n' +
  'A sense of wonder, as dreams arise thereof.\n' +
  '\n' +
  "Where once the sun's rays kissed the tranquil earth,\n" +
  'Now moonbeams dance upon a sharpened blade.\n' +
  'Silence descends, whispering tales of worth,\n' +
  "As shadows linger in the night's cascade.\n" +
  '\n' +
  'In this enchanting hour, hearts find solace,\n' +
  'As thoughts and desires interweave.\n' +
  'Immersed in darkness, love becomes velvet lace,\n' +
  'And secrets whispered in the night, conceive.\n' +
  '\n' +
  "Oh, twilight's splendor, a moment to treasure,\n" +
  'When night and day collide, loves ode to measure.';

async function callConversationCompletionFixed() {
  const streamingCount = await startCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'system', content: FIXED_PROMPT }],
    streaming: true,
  });

  const nonStreamingCount = await startCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'system', content: FIXED_PROMPT }],
    streaming: false,
  });

  console.log(`Streaming count: ${streamingCount}`);
  console.log(`Non-streaming count: ${nonStreamingCount}`);

  console.log(`Difference (Streaming): ${streamingCount - nonStreamingCount}`);
}

// callConversationCompletion('a62b9613-0dd3-4449-b7ab-a44c783bf233');
callConversationCompletionFixed();
