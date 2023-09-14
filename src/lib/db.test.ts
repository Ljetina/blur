import 'dotenv/config';
import { describe, test, expect } from 'vitest';
import { getFullConversation } from './db';

describe('getFullConversation function tests', () => {
  test('returns the expected data', async () => {
    const result = await getFullConversation(
      '488f3c07-1f94-4c48-b124-d0c57ea3cdc6'
    );
    expect(result).toMatchSnapshot();
  });
});
