import { Request, Response } from 'express';
import { createConversation, getDbClient, withDbClient } from '../../lib/db';

const handleCreateConversation = async (req: Request, res: Response) => {
  try {
    const { folder_id, name, prompt, temperature, model_id } = req.body;
    const { user_id, tenant_id } = req;
    const insertResult = await withDbClient((client) =>
      createConversation(
        {
          name,
          temperature,
          model_id,
          user_id: user_id as string,
          tenant_id: tenant_id as string,
        },
        client
      )
    );
    res.status(201).json({ ...insertResult.rows[0], message_count: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const handleDeleteConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, tenant_id } = req;

    const deleteQuery = `
      DELETE FROM conversations
      WHERE id = $1 AND user_id = $2 AND tenant_id = $3
    `;
    const deleteValues = [id, user_id, tenant_id];
    const deleteResult = await withDbClient(
      async (client) => await client.query(deleteQuery, deleteValues)
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const handleUpdateConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { folder_id, name, prompt, temperature, model_id } = req.body;
    const { user_id, tenant_id } = req;

    // Check if at least one field to update is provided
    if (!(folder_id || name || prompt || temperature || model_id)) {
      return res
        .status(400)
        .json({ error: 'At least one field to update must be provided' });
    }

    // Build query dynamically based on provided fields
    let updateQuery = 'UPDATE conversations SET ';
    const updateValues: any[] = [];
    let updateIndex = 1;

    const appendUpdateField = (fieldValue: any, fieldName: string) => {
      if (fieldValue) {
        updateQuery += `${fieldName} = $${updateIndex}, `;
        updateValues.push(fieldValue);
        updateIndex++;
      }
    };

    appendUpdateField(folder_id, 'folder_id');
    appendUpdateField(name, 'name');
    appendUpdateField(prompt, 'prompt');
    appendUpdateField(temperature, 'temperature');
    appendUpdateField(model_id, 'model_id');

    // Remove trailing comma and space
    updateQuery = updateQuery.slice(0, -2);

    updateQuery += ` WHERE id = $${updateIndex} AND user_id = $${
      updateIndex + 1
    } AND tenant_id = $${updateIndex + 2}`;
    updateValues.push(id, user_id, tenant_id);

    const updateResult = await withDbClient(
      async (client) => await client.query(updateQuery, updateValues)
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(200).json({ id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export {
  handleCreateConversation,
  handleDeleteConversation,
  handleUpdateConversation,
};
