import 'dotenv/config';
import express from 'express';

import { addAuthRoutes, authenticate } from './lib/auth';
import { initialDataHandler } from './routes/initial/initial';
import {
  handleCreateConversation,
  handleDeleteConversation,
  handleUpdateConversation,
} from './routes/conversation/conversation';
import { handleUpdateUserPreferences } from './routes/user/user';
import { morganMiddleware } from './lib/log';

export const app = express();

app.use(express.json());
app.use(morganMiddleware)
addAuthRoutes(app);
app.get('/initial', authenticate, initialDataHandler);
app.post('/conversation', authenticate, handleCreateConversation);
app.delete('/conversation/:id', authenticate, handleDeleteConversation);
app.put('/conversation/:id', authenticate, handleUpdateConversation);
app.put('/user', authenticate, handleUpdateUserPreferences);
app.listen(
  process.env.NODE_ENV == 'test'
    ? 9999
    : process.env.PORT
    ? JSON.parse(process.env.PORT)
    : 3001
);
