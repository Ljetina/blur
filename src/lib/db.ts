// import { pem } from './rdsPem';

import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.PG_DB_URL,
  max: 100,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 5000,
  // ssl: {
  //   rejectUnauthorized: false,
  //   ca: pem,
  // },
});

export function getPool() {
  return pool;
}

export async function getDbClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

export async function getUserByEmail(client: PoolClient, email: string) {
  const result = await client.query(`SELECT * FROM users WHERE email = $1`, [
    email,
  ]);

  // If a user is found, return the user's id. Otherwise, return null.
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// {"id" : "2b802813-86f0-4130-a06b-7e1775350592", "email" : "bartol@ljetina.com", "name" : "Bartol Karuza", "ui_show_prompts" : true, "ui_show_conversations" : true, "selected_tenant_id" : "ec224ff1-0f67-4164-8d06-37692f134c3a", "conversations" : [{"id":"fef6c0e1-78fa-4858-8cd9-f2697c82adc0","document_id":null,"created_at":"2023-07-28T03:53:17.114691","updated_at":"2023-07-28T03:53:17.114691","folder_id":null,"name":"test","prompt":"test prompt","temperature":0.5,"model_id":"gpt-4","user_id":"2b802813-86f0-4130-a06b-7e1775350592","tenant_id":"ec224ff1-0f67-4164-8d06-37692f134c3a"}]}
export async function initialServerData(userId: string, tenantId: string) {
  const client = await getDbClient();
  const resp = await client.query(
    `
    SELECT json_build_object(
      'id', users.id,
      'email', users.email,
      'name', users.name,
      'ui_show_prompts', users.ui_show_prompts,
      'ui_show_conversations', users.ui_show_conversations,
      'selected_tenant_id', users.selected_tenant_id,
      'conversations', 
        (SELECT json_agg(
          json_build_object(
            'id', cv.id,
            'created_at', cv.created_at,
            'updated_at', cv.updated_at,
            'folder_id', cv.folder_id,
            'name', cv.name,
            'prompt', cv.prompt,
            'temperature', cv.temperature,
            'model_id', cv.model_id,
            'message_count', (SELECT COUNT(*) FROM messages WHERE messages.conversation_id = cv.id AND role != 'system'),
            'messages', 
              (SELECT json_agg(last_messages.*)
               FROM (
                 SELECT *
                 FROM messages
                 WHERE messages.conversation_id = cv.id AND role != 'system'
                 ORDER BY messages.created_at DESC
                 LIMIT 10
               ) AS last_messages
              )
          )
        )
        FROM conversations cv
        WHERE cv.user_id = $1
        AND cv.tenant_id = $2
      )
    )
    FROM users
    WHERE users.id = $1`,
    [userId, tenantId]
  );
  return resp.rows[0]['json_build_object'];
}

export async function getMessages({
  client,
  user_id,
  tenant_id,
  conversation_id,
  page = 1,
  limit = 10,
}: {
  client: PoolClient;
  user_id: string;
  tenant_id: string;
  conversation_id: string;
  page?: number;
  limit?: number;
}) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT id, role, content, conversation_id, created_at, updated_at
    FROM messages
    WHERE user_id = $1 AND tenant_id = $2 AND conversation_id = $3 AND role != 'system'
    ORDER BY created_at DESC
    LIMIT $4 OFFSET $5;
`;

  const countQuery = `
      SELECT COUNT(*)
      FROM messages
      WHERE user_id = $1 AND tenant_id = $2 AND conversation_id = $3 AND role != 'system';
  `;

  const [result, countResult] = await Promise.all([
    client.query(query, [user_id, tenant_id, conversation_id, limit, offset]),
    client.query(countQuery, [user_id, tenant_id, conversation_id]),
  ]);

  const totalRecords = parseInt(countResult.rows[0].count, 10);
  const responseBody = {
    data: result.rows,
    pagination: {
      current_page: page,
      per_page: limit,
      total_pages: Math.ceil(totalRecords / limit),
      total_records: totalRecords,
    },
  };

  return responseBody;
}

export async function loadDemoConversation() {
  const client = await getDbClient();
  const conversation_id = 'fef6c0e1-78fa-4858-8cd9-f2697c82adc0';
  const resp = await client.query(
    "SELECT * FROM messages WHERE conversation_id = $1 AND role != 'system' ORDER BY created_at ASC",
    [conversation_id]
  );
  return resp.rows;
}

export async function loadPricing() {
  const client = await getDbClient();
  const conversation_id = 'ba08401a-4e6c-4b8c-a470-f4cacda7f79f';
  const resp = await client.query(
    "SELECT * FROM messages WHERE conversation_id = $1 AND role != 'system' ORDER BY created_at ASC",
    [conversation_id]
  );
  return resp.rows;
}
