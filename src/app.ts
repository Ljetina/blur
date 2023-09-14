import 'dotenv/config';
import express, { Express } from 'express';

import { addAuthRoutes, authenticate } from './lib/auth';
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

export function prepareApp() {
  const app = express();

  app.use(express.json());
  app.use(morganMiddleware);
  addAuthRoutes(app);
  app.get('/initial', authenticate, initialDataHandler);
  app.post('/conversation', authenticate, handleCreateConversation);
  app.delete('/conversation/:id', authenticate, handleDeleteConversation);
  app.put('/conversation/:id', authenticate, handleUpdateConversation);
  app.get('/conversation/:id/message', authenticate, handleMessages);
  app.put('/user', authenticate, handleUpdateUserPreferences);
  app.post('/waitinglist', handleWaitingList);
  app.get('/demo/main', handleDemoConversation);
  app.get('/demo/pricing', handleDemoPricing);

  return app;
}

export function startListening(app: Express) {
  app.listen(
    process.env.NODE_ENV == 'test'
      ? 9999
      : process.env.PORT
      ? JSON.parse(process.env.PORT)
      : 3001
  );
}
