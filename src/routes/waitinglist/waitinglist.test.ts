import request from 'supertest';
// import { app } from '../../index.js'; // Import your Express app
import { prepareApp } from '../../app.js';
import { Express } from 'express';
import { describe, it, expect, beforeAll } from 'vitest';

describe('POST /waitinglist', () => {
  let app: Express | null = null;
  beforeAll(() => {
    app = prepareApp();
  });
  it('should add an email to the waiting list', async () => {
    const email = 'test@example.com'; // Replace with a valid email

    const res = await request(app).post(`/waitinglist`).send({ email });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

export {};
