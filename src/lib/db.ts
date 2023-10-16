// import { pem } from './rdsPem';

import { Conversation, DbMessage } from '@App/types/model';
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

export async function withDbClient<T>(
  callback: (conn: PoolClient) => Promise<T>
): Promise<T> {
  const conn = await pool.connect();
  try {
    return await callback(conn);
  } finally {
    conn.release();
  }
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
  const resp = await withDbClient(
    async (client) =>
      await client.query(
        `
    SELECT json_build_object(
      'id', users.id,
      'email', users.email,
      'name', users.name,
      'ui_show_prompts', users.ui_show_prompts,
      'ui_show_conversations', users.ui_show_conversations,
      'selected_tenant_id', users.selected_tenant_id,
      'tenant_credits', tenants.credits,
      'jupyter_settings', json_build_object(
        'host', coalesce(jupyter_settings.host, ''),
        'port', coalesce(jupyter_settings.port, ''),
        'token', coalesce(jupyter_settings.token, ''),
        'notebooks_folder_path', coalesce(jupyter_settings.notebooks_folder_path, '')
      ),
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
        FROM (
          SELECT *
          FROM conversations
          WHERE user_id = $1 AND tenant_id = $2
          ORDER BY created_at ASC
        ) AS cv
      )
    )
    FROM users
    LEFT JOIN jupyter_settings ON users.id = jupyter_settings.user_id
    JOIN tenants ON users.selected_tenant_id = tenants.id  -- joining 'users' and 'tenants'
    WHERE users.id = $1`,
        [userId, tenantId]
      )
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
  const conversation_id = 'fef6c0e1-78fa-4858-8cd9-f2697c82adc0';
  const resp = await withDbClient(
    async (client) =>
      await client.query(
        "SELECT * FROM messages WHERE conversation_id = $1 AND role != 'system' ORDER BY created_at ASC",
        [conversation_id]
      )
  );
  return resp.rows;
}

export async function loadPricing() {
  const conversation_id = 'ba08401a-4e6c-4b8c-a470-f4cacda7f79f';
  const resp = await withDbClient(
    async (client) =>
      await client.query(
        "SELECT * FROM messages WHERE conversation_id = $1 AND role != 'system' ORDER BY created_at ASC",
        [conversation_id]
      )
  );
  return resp.rows;
}

export async function getConversation(
  conversationId: string
): Promise<Conversation> {
  const resp = await withDbClient(
    async (client) =>
      await client.query(
        `SELECT 
          conversations.id, 
          conversations.name, 
          conversations.prompt, 
          conversations.model_id, 
          conversation_notebook.notebook_path AS notebook_path, 
          conversation_notebook.notebook_name AS notebook_name, 
          conversation_notebook.session_id AS notebook_session_id, 
          conversation_notebook.kernel_id AS notebook_kernel_id,
          conversations.tenant_id,
          conversations.user_id,
          tenants.credits AS tenant_credits
        FROM conversations
        LEFT JOIN conversation_notebook ON conversation_notebook.conversation_id = conversations.id
        JOIN tenants ON tenants.id = conversations.tenant_id
        WHERE conversations.id = $1`,
        [conversationId]
      )
  );
  const row = resp.rows[0];
  return row;
}

export async function getMessagesForPrompt(
  conversationId: string
): Promise<DbMessage[]> {
  const resp = await withDbClient(
    async (client) =>
      await client.query(
        `SELECT 
          messages.id, 
          messages.role, 
          messages.content, 
          messages.compressed_content, 
          messages.function_name,
          messages.function_arguments,
          messages.name
        FROM messages
        WHERE messages.conversation_id = $1
        ORDER BY messages.created_at ASC`,
        [conversationId]
      )
  );
  return resp.rows;
}

export interface InputMessage {
  conversation_id: string;
  message_id?: string;
  role: string;
  message_content?: string;
  function_name?: string;
  function_arguments?: string;
  compressed_content?: string | null;
  name?: string | null;
}

export async function storeMessage({
  conversation_id,
  message_id,
  role,
  message_content,
  compressed_content = null,
  name = null,
}: InputMessage) {
  const values = [
    conversation_id,
    role,
    message_content,
    compressed_content,
    name,
  ];
  if (message_id) {
    values.push(message_id);
  }
  const resp = await withDbClient(
    async (client) =>
      await client.query(
        `
    WITH conversation_data AS (
        SELECT user_id, tenant_id
        FROM conversations
        WHERE id = $1
    )
    INSERT INTO messages (id, role, content, compressed_content, conversation_id, name, user_id, tenant_id, created_at, updated_at)
    VALUES (${
      message_id ? '$6' : 'uuid_generate_v4()'
    }, $2, $3, $4, $1, $5, (SELECT user_id FROM conversation_data), (SELECT tenant_id FROM conversation_data), NOW(), NOW())
    RETURNING *;
    `,
        values
      )
  );
  return resp.rows[0];
}

export async function storeMessages(messages: InputMessage[]) {
  const params: (string | null | undefined)[] = [messages[0].conversation_id];
  const chunks: any[] = [];

  messages.forEach((message, index) => {
    const paramIndex = index * 7 + 2;
    params.push(
      message.role,
      message.message_content,
      message.function_name,
      message.function_arguments,
      message.compressed_content || null,
      message.name || null,
      message.message_id
    );
    chunks.push(`(
      $${paramIndex + 6},
      $1,
      $${paramIndex},
      $${paramIndex + 1},
      $${paramIndex + 2},
      $${paramIndex + 3},
      $${paramIndex + 4},
      $${paramIndex + 5},
      (SELECT user_id FROM conversation_data),
      (SELECT tenant_id FROM conversation_data),
      NOW() + '${index} milliseconds'::interval,
      NOW() + '${index} milliseconds'::interval
    )`);
  });

  const sql = `
  WITH conversation_data AS (
    SELECT user_id, tenant_id
    FROM conversations
    WHERE id = $1
  )
  INSERT INTO messages (id, conversation_id, role, content, function_name, function_arguments, compressed_content, name, user_id, tenant_id, created_at, updated_at)
  VALUES ${chunks.join(',')}
  RETURNING *;
`;

  const resp = await withDbClient(
    async (client) => await client.query(sql, params)
  );

  return resp.rows;
}

export async function storeApiUsage({
  tenant_id,
  user_id,
  conversation_id,
  prompt_tokens,
  completion_tokens,
  credits,
  is_deducted = true,
}: {
  tenant_id: string;
  user_id: string;
  conversation_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  credits: number;
  is_deducted?: boolean;
}) {
  const creditResp = await withDbClient(async (client) => {
    // Begin transaction
    await client.query('BEGIN');

    // Insert into api_usage
    await client.query(
      `
        INSERT INTO api_usage (id, tenant_id, user_id, conversation_id, 
                              prompt_tokens, completion_tokens, is_deducted, credits, created_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *;
        `,
      [
        tenant_id,
        user_id,
        conversation_id,
        prompt_tokens,
        completion_tokens,
        is_deducted,
        credits,
      ]
    );

    // Deduct credits from tenants
    const creditResp = await client.query(
      `
      UPDATE tenants
      SET credits = credits - $1
      WHERE id = $2 
      RETURNING credits;
      `,
      [credits, tenant_id]
    );

    // Commit transaction
    await client.query('COMMIT');

    return creditResp.rows[0];
  });

  return creditResp;
}
