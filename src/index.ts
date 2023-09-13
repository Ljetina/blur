import 'dotenv/config';
import express from 'express';

import { addAuthRoutes } from './lib/auth';

const app = express();

app.use(express.json())

addAuthRoutes(app);

app.listen(3001);
