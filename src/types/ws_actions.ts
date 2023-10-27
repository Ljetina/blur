export type USER_ACTION =
  | 'create_message'
  // | 'edit_message'
  // | 'confirm'
  // | 'reject'
  // | 'reload'
  | 'frontend_function_result'
  | 'notebook_updated'
  | 'abort'
  | 'regenerate_message';

export type SERVER_ACTION =
  | 'message_ack'
  | 'message_regenerate_ack'
  | 'append_to_message'
  // | 'request_confirm'
  | 'notebook_cache'
  | 'response_done'
  | 'start_function'
  | 'start_frontend_function'
  | 'function_result'
  | 'response_error'
  | 'out_of_credits'
  | 'remaining_credits'
  | 'credit_topup';
