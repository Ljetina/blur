import 'dotenv/config';
import { prepareApp, startListening } from './app';
import { startWsServer } from './stream/wschat';

startListening(prepareApp());
startWsServer();

export {};
