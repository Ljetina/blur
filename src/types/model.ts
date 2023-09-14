export interface Message {
  role: string;
  content: string;
  compressed_content?: string;
  name?: string;
}
