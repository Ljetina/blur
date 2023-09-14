import request from 'supertest';
import { prepareApp } from '../../app.js'; // Import your Express app
import { describe, it, expect } from 'vitest';

describe('PUT /user', () => {
  it('should update user preferences', async () => {
    const userId = 'some-user-id'; // Replace with a valid user ID
    const tenantId = 'some-tenant-id'; // Replace with a valid tenant ID
    const updatedData = {
      ui_show_prompts: false,
      ui_show_conversations: false,
    };

    const res = await request(prepareApp())
      .put(`/user`)
      .set('x-inject-user_id', '2b802813-86f0-4130-a06b-7e1775350592')
      .set('x-inject-tenant_id', 'ec224ff1-0f67-4164-8d06-37692f134c3a')
      .send(updatedData);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('result', 'OK');
  });
});

export {};
