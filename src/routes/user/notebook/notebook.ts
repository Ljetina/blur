import { getDbClient, withDbClient } from '../../../lib/db';
import { Request, Response } from 'express';

export const handleCreateUserNotebook = async (req: Request, res: Response) => {
  try {
    const { user_id } = req;
    const { host, port, serverToken, notebookFolderPath } = req.body;

    const upsertQuery = `
        INSERT INTO jupyter_settings (id, user_id, host, port, token, notebooks_folder_path)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
        ON CONFLICT (user_id)
        DO UPDATE SET
          host = $2,
          port = $3,
          token = $4,
          notebooks_folder_path = $5
        RETURNING host, port, token, notebooks_folder_path
      `;
    const upsertValues = [user_id, host, port, serverToken, notebookFolderPath];

    const upsertResult = await withDbClient(
      async (client) => await client.query(upsertQuery, upsertValues)
    );

    res.status(200).json(upsertResult.rows[0]);
  } catch (err) {
    console.log({ err });
    res.status(500).json({ error: 'Internal server error' });
  }
};
