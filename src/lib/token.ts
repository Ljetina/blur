import { Message } from '@App/types/model';
import tiktoken from 'tiktoken-node';
import { Function } from './functions';

const encoding = tiktoken.getEncoding('cl100k_base');

export function countTokens(input: string) {
  return encoding.encode(input).length;
}

export function tokenLimitNotebook(input: string) {
  const tokenCount = countTokens(input);
  const notebook = JSON.parse(input);
  let selectedNotebookContent = input;
  if (tokenCount > 1500) {
    let selectedCells = notebook.slice(0, 2);
    selectedCells.push(notebook[notebook.length - 1]);
    for (let i = notebook.length - 2; i >= 2; i--) {
      let potentialCells = selectedCells.concat(notebook[i]);
      if (countTokens(JSON.stringify(potentialCells)) <= 1500) {
        selectedCells = potentialCells;
      } else {
        break;
      }
    }
    selectedCells.sort((a: any, b: any) => a.index - b.index);
    selectedNotebookContent = JSON.stringify(selectedCells);
  }
  return [selectedNotebookContent, notebook.length, tokenCount];
}

export function tokenLimitConversationHistory(
  messages: Message[],
  tokenBudget = 4000,
  messageLimit = 10
) {
  const encodingLengths = messages.map((m) => {
    const contentToCount: string = m.function_call
      ? // TODO check this looks like duplication
        m.function_call.name + m.function_call.name
      : (m.content as string);
    if (!contentToCount) {
      return 0;
    }
    return encoding.encode(contentToCount).length;
  });
  let tokenBudgetRemaining = tokenBudget;
  if (messages.length <= 4) {
    return messages;
  }

  const firstTwoMessages = messages.slice(0, 2);
  const lastTwoMessages = messages.slice(-2);

  tokenBudgetRemaining -=
    // Exclude the system message from this budget
    // encodingLengths[0] +
    encodingLengths[1] +
    encodingLengths[encodingLengths.length - 1] +
    encodingLengths[encodingLengths.length - 2];

  let remainingMessages = messages.slice(2, -2);
  remainingMessages = remainingMessages.reverse();

  let remainingEncodingLengths = encodingLengths.slice(2);
  remainingEncodingLengths = remainingEncodingLengths.reverse();

  const messageAcc = [];
  for (let i = 0; i < Math.min(remainingMessages.length, messageLimit); i++) {
    if (remainingEncodingLengths[i] > tokenBudgetRemaining) {
      continue;
    } else {
      tokenBudgetRemaining -= remainingEncodingLengths[i];
      messageAcc.push(remainingMessages[i]);
    }
  }
  const filteredMessages = firstTwoMessages
    .concat(messageAcc.reverse())
    .concat(lastTwoMessages);
  console.log(
    'id',
    filteredMessages
      .filter((m) => typeof m.content == 'string')
      // @ts-ignore
      .map((m) => m.content?.substring(0, 20) || m.name)
  );

  return filteredMessages;
}

export function countInputTokens(messages: Message[], functions?: Function[]) {
  let inputTokenCount = 0;
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'text') {
          inputTokenCount += encoding.encode(message.role + ' ' + content.text).length + 4;
        } else if (content.type === 'image_url') {
          if (content?.image_url?.detail === 'high') {
            inputTokenCount += 129; // high detail image tokens
          } else {
            inputTokenCount += 65; // low detail image tokens
          }
        }
      }
    } else if (typeof message.content === 'string') {
      inputTokenCount += encoding.encode(message.role + ' ' + message.content).length + 4;
    }
  }
  inputTokenCount -= messages.length;
  inputTokenCount += 3;
  if (functions) {
    const functionTokenCount = encoding.encode(
      JSON.stringify(functions || '')
    ).length;
    inputTokenCount += functionTokenCount;
    inputTokenCount -= 4;
  }
  return inputTokenCount;
}

// function queryVectorDb(messages, tokenBudget = 1000) {
//   const results = similaritySearch(messages[messages.length - 1].content); // replace with actual function
//   messages[0].content += `\n\nExtra context for the most recent user message:\n${results}`;
//   return messages;
// }

// const openai = require('openai'); // replace this with actual openai library
// const { DatabaseHandler } = require('./databaseHandler'); // replace this with actual database handler module

// async function similaritySearch(query: string, tenantId = "2a6b635c-c9e1-4b61-a448-c37e6a2e9bf2", tokenBudget = 1000) {
//     const embeddings = await openai.Embedding.create({ input: [query], model: "text-embedding-ada-002" });
//     const queryVector = embeddings.data[0].embedding;
//     const db = new DatabaseHandler(); // assuming DatabaseHandler is a class

//     const sql = `
//         WITH query_vector AS (
//             SELECT $1::VECTOR AS vector
//         )
//         SELECT
//             snippets.id,
//             snippets.document_id,
//             snippets.start_index,
//             snippets.end_index,
//             snippets.token_count,
//             snippets.vector <-> (SELECT vector FROM query_vector) AS similarity
//         FROM
//             snippets
//         WHERE
//             snippets.tenant_id = $2
//         ORDER BY
//             snippets.vector <-> (SELECT vector FROM query_vector)
//         LIMIT 20;
//     `;

//     const results = await db.execute(sql, [queryVector, tenantId]);
//     let selectedSnippets = [];
//     let totalTokens = 0;

//     for (const row of results) {
//         const [snippetId, docId, startIndex, endIndex, tokenCount, similarity] = row;

//         if (totalTokens + tokenCount > tokenBudget) {
//             break;
//         }

//         selectedSnippets.push(row);
//         totalTokens += tokenCount;
//     }

//     const documentContents = {};
//     const snippetContentAgg = [];
//     for (const snippet of selectedSnippets) {
//         const [snippetId, docId, startIndex, endIndex, tokenCount, similarity] = snippet;

//         if (!documentContents[docId]) {
//             const sql = `
//                 SELECT content
//                 FROM documents
//                 WHERE id = $1;
//             `;
//             documentContents[docId] = await db.executeAndFetchOne(sql, [docId]);
//         }

//         const content = documentContents[docId];
//         const snippetContent = content.slice(startIndex, endIndex);
//         snippetContentAgg.push(snippetContent);
//     }

//     return snippetContentAgg.join("***");
// }
