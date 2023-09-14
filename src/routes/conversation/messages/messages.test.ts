import request from 'supertest';
import { prepareApp } from '../../../app.js'; // Import your Express app
import { describe, it, expect } from 'vitest';

describe('GET /conversations/:id/messages', () => {
  it('should return empty response', async () => {
    const res = await request(prepareApp())
      .get(`/conversation/a319526b-4732-45dc-b8d0-a3fc5836179c/message`)
      .set('x-inject-user_id', '2b802813-86f0-4130-a06b-7e1775350592')
      .set('x-inject-tenant_id', 'ec224ff1-0f67-4164-8d06-37692f134c3a');

    expect(res.text).toMatchSnapshot();
  });
});

export {};
