import { getDbClient } from '../../lib/db';
import { Request, Response } from 'express';

export const handleWaitingList = async (req: Request, res: Response) => {
  const client = await getDbClient();
  req.body;
  const { email } = req.body;
  await client.query(
    `INSERT INTO waitlist_items (email)
    VALUES ($1)`,
    [email]
  );
  return res.send({ status: 'ok' });
};
