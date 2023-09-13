import { Request, Response } from 'express';
import { initialServerData } from '../../lib/db';

interface ChatBody {
  conversation_id?: string;
  message_content: string;
}

const handler = async (req: Request, res: Response) => {
  const initialData = await initialServerData(
    req.user_id as string,
    req.tenant_id as string
  );
  res.send(initialData);
};

export { handler as initialDataHandler };
