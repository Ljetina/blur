import { Message } from '@App/types/model';
import tiktoken from 'tiktoken-node';

const encoding = tiktoken.getEncoding('cl100k_base');

export function tokenLimitConversationHistory(messages: Message[], tokenBudget = 4000) {
  const encodingLengths = messages.map(
    (m) => encoding.encode(m.content).length
  );
  let tokenBudgetRemaining = tokenBudget;

  const firstMessage = messages[0];
  tokenBudgetRemaining -= encodingLengths[0];

  const secondMessage = messages[1];
  tokenBudgetRemaining -= encodingLengths[1];

  let remainingMessages = messages.slice(2);
  remainingMessages = remainingMessages.reverse();

  let remainingEncodingLengths = encodingLengths.slice(2);
  remainingEncodingLengths = remainingEncodingLengths.reverse();

  const messageAcc = [];
  for (let i = 0; i < remainingMessages.length; i++) {
    if (remainingEncodingLengths[i] > tokenBudgetRemaining) {
      continue;
    } else {
      tokenBudgetRemaining -= remainingEncodingLengths[i];
      messageAcc.push(remainingMessages[i]);
    }
  }
  const filteredMessages = [firstMessage, secondMessage].concat(
    messageAcc.reverse()
  );

  return filteredMessages;
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