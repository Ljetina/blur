import { getDbClient, withDbClient } from '../../../lib/db';
import { Request, Response } from 'express';

export const handleUpsertConversationNotebook = async (
  req: Request,
  res: Response
) => {
  try {
    const conversationId = req.params.id;
    const { notebook_path, notebook_name, session_id, kernel_id } = req.body;

    const upsertQuery = `
        INSERT INTO conversation_notebook (conversation_id, notebook_path, notebook_name, session_id, kernel_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (conversation_id)
        DO UPDATE
        SET
          notebook_path = $2,
          notebook_name = $3,
          session_id = $4,
          kernel_id = $5
        RETURNING id, conversation_id, notebook_path, notebook_name, session_id, kernel_id
      `;
    const upsertValues = [
      conversationId,
      notebook_path,
      notebook_name,
      session_id,
      kernel_id,
    ];

    const upsertResult = await withDbClient(
      async (client) => await client.query(upsertQuery, upsertValues)
    );

    res.status(200).json(upsertResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const handleGetConversationNotebookSettings = async (
  req: Request,
  res: Response
) => {
  try {
    const conversationId = req.params.id;

    const fetchQuery = `
      SELECT notebook_path, notebook_name, session_id, kernel_id
      FROM conversation_notebook
      WHERE conversation_id = $1
    `;
    const fetchValues = [conversationId];

    const fetchResult = await withDbClient(
      async (client) => await client.query(fetchQuery, fetchValues)
    );

    if (fetchResult.rows.length === 0) {
      res.status(200).json({});
    } else {
      res.status(200).json(fetchResult.rows[0]);
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
