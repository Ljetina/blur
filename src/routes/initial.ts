import { Request, Response } from 'express';
import { initialServerData } from '../lib/db';

export async function initialDataHandler(req: Request, res: Response) {
  try {
    const tokenId = req.session.id;
    const data = await initialServerData(tokenId);
    res.json(data);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ error: 'An error occurred while fetching the initial data' });
  }
}
