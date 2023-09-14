import 'dotenv/config';
import { test, describe, vi, expect } from 'vitest';
import { makeChoiceHandler, prepareMessages } from './openai'; // replace with your module path
import { beforeEach } from 'node:test';

describe('makeChoiceHandler function tests', () => {
  const mockEvent = vi.fn();

  beforeEach(() => {
    mockEvent.mockClear();
  });

  test('handles function call', () => {
    const handler = makeChoiceHandler(mockEvent);
    handler({
      index: 0,
      delta: {
        function_call: {
          name: 'testFunction',
          arguments: 'a bit',
        },
      },
      finish_reason: null,
    });
    handler({
      index: 1,
      delta: {
        function_call: {
          name: 'testFunction',
          arguments: ' of argumentation',
        },
      },
      finish_reason: 'done',
    });
    expect(mockEvent).toHaveBeenCalledWith('start_function', {
      functionName: 'testFunction',
      functionArguments: 'a bit of argumentation',
    });
  });

  test('handles message delta', () => {
    const handler = makeChoiceHandler(mockEvent);
    handler({
      index: 0,
      delta: {
        content: 'testContent',
      },
      finish_reason: null,
    });
    expect(mockEvent).toHaveBeenCalledWith('append_to_message', 'testContent');
  });

  test('handles function call completion', () => {
    const handler = makeChoiceHandler(mockEvent);
    handler({
      index: 0,
      delta: {
        function_call: {
          name: 'testFunction',
          arguments: 'testArguments',
        },
      },
      //   TODO fix this with a real finish_reason
      finish_reason: 'some function finish reason',
    });
    expect(mockEvent).toHaveBeenCalledWith('start_function', {
      functionName: 'testFunction',
      functionArguments: 'testArguments',
    });
  });

  test('handles non-function call completion', () => {
    const handler = makeChoiceHandler(mockEvent);
    handler({
      index: 0,
      delta: {
        content: 'testContent',
      },
      finish_reason: null,
    });
    expect(mockEvent).toHaveBeenCalledWith('append_to_message', 'testContent');
    handler({
      index: 0,
      delta: {},
      finish_reason: 'stop',
    });
    expect(mockEvent).toHaveBeenCalledWith('response_done', 'testContent');
  });
});

describe('prepare messages', () => {
  test('returns the expected data', async () => {
    const result = await prepareMessages(
      '488f3c07-1f94-4c48-b124-d0c57ea3cdc6',
      'testQuery'
    );
    expect(result).toMatchSnapshot();
  });
});
