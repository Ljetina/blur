import morgan from 'morgan';
import { createLogger, transports, format } from 'winston';

// const morgan = require('morgan');
// const winston = require('winston');

export const logger = createLogger({
  format: format.combine(
    format.colorize(),
    format.timestamp(),
    format.printf((msg: any) => {
      return `${msg.timestamp} [${msg.level}] ${msg.message}`;
    })
  ),
  transports: [new transports.Console({ level: 'http' })],
});

export const morganMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message: any) => logger.http(message.trim()),
    },
  }
);
