import 'dotenv/config';
import express, { Express } from 'express';
import http from 'http';

import { addAuthRoutes, authenticate, getSessionMiddleWare } from './lib/auth';
import { initialDataHandler } from './routes/initial/initial';
import {
  handleCreateConversation,
  handleDeleteConversation,
  handleUpdateConversation,
} from './routes/conversation/conversation';
import { handleUpdateUserPreferences } from './routes/user/user';
import { morganMiddleware } from './lib/log';
import { handleWaitingList } from './routes/waitinglist/waitinglist';
import { handleMessages } from './routes/conversation/messages/messages';
import { handleDemoConversation, handleDemoPricing } from './routes/demo/demo';
import {
  handleGetConversationNotebookSettings,
  handleUpsertConversationNotebook,
} from './routes/conversation/notebook/notebook';
import { handleCreateUserNotebook } from './routes/user/notebook/notebook';
import { startWsServer } from './stream/wschat';
import { stripeCallbackHandler } from './routes/stripe/webhook';
import bodyParser from 'body-parser';

export function prepareApp(sessionMiddleware: any) {
  const app = express();

  app.get('/health', (req, res) => {
    res.status(200).send('ok');
  });
  app.use(morganMiddleware);
  app.use(
    '/stripe/webhook',
    bodyParser.raw({ type: '*/*' }),
    stripeCallbackHandler
  );
  app.use(express.json());

  addAuthRoutes(app, sessionMiddleware);
  // app.use('*', (req, res) => {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // });
  app.get('/initial', authenticate, initialDataHandler);
  app.post('/conversation', authenticate, handleCreateConversation);
  app.delete('/conversation/:id', authenticate, handleDeleteConversation);
  app.put('/conversation/:id', authenticate, handleUpdateConversation);
  app.get('/conversation/:id/message', authenticate, handleMessages);
  app.post(
    '/conversation/:id/notebook',
    authenticate,
    handleUpsertConversationNotebook
  );
  app.get(
    '/conversation/:id/notebook',
    authenticate,
    handleGetConversationNotebookSettings
  );
  app.put('/user', authenticate, handleUpdateUserPreferences);
  app.post('/user/notebook', authenticate, handleCreateUserNotebook);
  app.post('/waitinglist', handleWaitingList);

  app.get('/demo/main', handleDemoConversation);
  app.get('/demo/pricing', handleDemoPricing);

  return app;
}

export function startListening() {
  const app = prepareApp(getSessionMiddleWare());
  const server = http.createServer(app);
  startWsServer(server);
  server.listen(
    process.env.NODE_ENV == 'test'
      ? 9999
      : process.env.PORT
      ? JSON.parse(process.env.PORT)
      : 3001
  );
}
