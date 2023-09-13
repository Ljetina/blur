import { Request, Response } from 'express';
import { getDbClient } from '../../lib/db';

export const handleUpdateUserPreferences = async (
  req: Request,
  res: Response
) => {
  try {
    const client = await getDbClient();
    const { ui_show_prompts, ui_show_conversations } = req.body;
    const { user_id } = req;

    // Check if at least one field to update is provided
    if (
      typeof ui_show_prompts == 'undefined' &&
      typeof ui_show_conversations == 'undefined'
    ) {
      return res
        .status(400)
        .json({ error: 'At least one field to update must be provided' });
    }

    // Build query dynamically based on provided fields
    let updateQuery = 'UPDATE users SET ';
    const updateValues = [];
    let updateIndex = 1;

    const appendUpdateField = (fieldValue: any, fieldName: string) => {
      if (fieldValue !== undefined) {
        updateQuery += `${fieldName} = $${updateIndex}, `;
        updateValues.push(fieldValue);
        updateIndex++;
      }
    };

    appendUpdateField(ui_show_prompts, 'ui_show_prompts');
    appendUpdateField(ui_show_conversations, 'ui_show_conversations');

    // Remove trailing comma and space
    updateQuery = updateQuery.slice(0, -2);

    updateQuery += ` WHERE id = $${updateIndex}`;
    updateValues.push(user_id);

    // console.log({ updateQuery });
    await client.query(updateQuery, updateValues)

    res.status(200).json({ result: 'OK' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
