import { getDbClient } from '../../lib/db';
import { Request, Response } from 'express';

export async function handleDemoConversation(req: Request, res: Response) {
  const client = await getDbClient();
  const conversation_id = 'fef6c0e1-78fa-4858-8cd9-f2697c82adc0';
  const resp = await client.query(
    "SELECT * FROM messages WHERE conversation_id = $1 AND role != 'system' ORDER BY created_at ASC",
    [conversation_id]
  );
  res.status(200).json(resp.rows);
}

export async function handleDemoPricing(req: Request, res: Response) {
  const client = await getDbClient();
  const conversation_id = 'ba08401a-4e6c-4b8c-a470-f4cacda7f79f';
  const resp = await client.query(
    "SELECT * FROM messages WHERE conversation_id = $1 AND role != 'system' ORDER BY created_at ASC",
    [conversation_id]
  );
  res.status(200).json(resp.rows);
}
