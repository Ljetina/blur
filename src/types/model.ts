import { InputMessage } from '@App/lib/db';

/**
 * Message as passed to OpenAI API https://platform.openai.com/docs/api-reference/chat/create
 */
export interface Message {
  role: string;
  content: string | null;
  compressed_content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface DbMessage {
  id: string;
  role: string;
  content?: string;
  compressed_content?: string;
  function_name?: string;
  function_arguments?: string;
  name?: string;
}

export interface FullConversation {
  name: string;
  prompt: string;
  model_id: string;
  messages: DbMessage[];
  notebook: {
    path: string;
    name: string;
    session_id: string;
    kernel_id: string;
  };
}
