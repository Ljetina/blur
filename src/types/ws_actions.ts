export type USER_ACTION =
  | 'create_message'
  | 'edit_message'
  | 'confirm'
  | 'reject'
  | 'reload';

export type SERVER_ACTION =
  | 'message_ack'
  | 'append_to_message'
  | 'request_confirm'
  | 'response_done'
  | 'start_function'
  | 'function_result';
