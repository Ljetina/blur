import { withDbClient } from '../../../lib/db';
import { Request, Response } from 'express';

export async function handleMessages(req: Request, res: Response) {
  const { user_id, tenant_id } = req;
  const { id } = req.params;
  const { page, limit } = req.query;

  const resolvedPage = Number(page || 1);
  const resolvedLimit = Number(limit || 50);

  const offset = (resolvedPage - 1) * resolvedLimit;

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

  const { result, countResult } = await withDbClient(async (client) => {
    const [result, countResult] = await Promise.all([
      client.query(query, [user_id, tenant_id, id, resolvedLimit, offset]),
      client.query(countQuery, [user_id, tenant_id, id]),
    ]);

    return { result, countResult };
  });

  const totalRecords = parseInt(countResult.rows[0].count, 10);
  const responseBody = {
    data: result.rows,
    pagination: {
      current_page: resolvedPage,
      per_page: resolvedLimit,
      total_pages: Math.ceil(totalRecords / resolvedLimit),
      total_records: totalRecords,
    },
  };

  res.send(responseBody);
}
