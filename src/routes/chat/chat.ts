import { NextFunction, Request, Response } from 'express';
import { PassthroughStream } from '../../lib/passthroughStream';

interface ChatBody {
  conversation_id?: string;
  message_content: string;
}

const handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conversation_id, message_content }: ChatBody = req.body; // Remove await
    const stream = await PassthroughStream(
      conversation_id as string,
      message_content
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('x-auth', process.env.FUNC_AUTH as string);

    stream.on('data', function (data) {
      res.write(`data: ${data}\n\n`);
    });

    stream.on('end', function () {
      res.end();
    });

    stream.on('error', function (error) {
      console.error('An error occurred:', error);
      res
        .status(500)
        .send({ error: 'An error occurred while processing the stream' });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'An error occurred' });
  }
};

export { handler as chatHandler };
