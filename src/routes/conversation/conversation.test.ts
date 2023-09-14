import request from 'supertest';
import { prepareApp } from '../../app.js'; // Import your Express app
import { describe, it, expect } from 'vitest';

describe('PUT /conversation/:id', () => {
  it('should update conversation data', async () => {
    const conversationId = 'a319526b-4732-45dc-b8d0-a3fc5836179c'; // Replace with a valid conversation ID
    const updatedData = {
      folder_id: 'a319526b-4732-45dc-b8d0-a3fc5836179c',
      name: 'new-name',
      prompt: 'new-prompty',
      temperature: 0.8,
      model_id: 'new-model-id',
    };

    const res = await request(prepareApp())
      .put(`/conversation/${conversationId}`)
      .set('x-inject-user_id', '2b802813-86f0-4130-a06b-7e1775350592')
      .set('x-inject-tenant_id', 'ec224ff1-0f67-4164-8d06-37692f134c3a')
      .send(updatedData);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('id', conversationId);
  });
});

export {};
