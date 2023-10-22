import { Conversation, FullConversation } from '@App/types/model';

type FunctionName =
  | 'add_cell'
  | 'update_cell'
  | 'delete_cell'
  | 'read_cells'
  | 'read_cell_output';

export const FRONTEND_FUNCTIONS: FunctionName[] = [
  'add_cell',
  'update_cell',
  'delete_cell',
  'read_cells',
  'read_cell_output',
];

interface Property {
  type: string;
  description?: string;
  properties?: { [key: string]: Property };
  required?: string[];
}

export interface Function {
  name: string;
  description: string;
  parameters: Property;
}

export async function getFunctions({
  conversation,
}: {
  conversation: Conversation;
}) {
  let functions: Function[] = [];
  if (conversation.notebook_path) {
    functions = functions.concat(notebookFunctions);
  }
  if (functions.length == 0) {
    return undefined;
  }
  return functions;
}

const notebookFunctions: Function[] = [
  {
    name: 'read_cell_output',
    description: 'Read the last output of the cell at index',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: 'The index of the cell',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'add_cell',
    description: 'Add a cell to the notebook and run it',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code',
        },
        cell_type: {
          type: 'string',
          description: 'code or markdown',
        },
      },
      required: ['code', 'cell_type'],
    },
  },
  {
    name: 'update_cell',
    description: 'Update an existing cell to the notebook and re-run it',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code',
        },
        index: {
          type: 'number',
          description: 'The index of the cell',
        },
      },
      required: ['code', 'index'],
    },
  },
  {
    name: 'delete_cell',
    description: 'Delete a cell from the notebook',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: 'The index of the cell',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'read_cells',
    description: 'Read all cells from the notebook, this will only update the source, not the outputs',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
