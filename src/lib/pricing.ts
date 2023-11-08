import { ModelId } from '@App/types/model';

const modelToPrice = {
  'gpt-3.5-turbo': [0.0018, 0.0022],
  'gpt-4': [0.036, 0.072],
  'gpt-4-1106-preview': [0.012, 0.024],
};

export function centsToCredits(cents: number) {
  return Math.floor(cents * 100);
}

export function dollarsToCents(dollars: number) {
  return dollars * 100;
}

export function dollarsToCredits(dollars: number) {
  return centsToCredits(dollarsToCents(dollars));
}

export function tokensToCredits(modelId: ModelId, usage: RequestUsage) {
  const [inputPrice, outputPrice] = modelToPrice[modelId];
  return (
    dollarsToCredits(inputPrice * usage.promptTokens / 1000) +
    dollarsToCredits(outputPrice * usage.completionTokens / 1000)
  );
}

export interface RequestUsage {
  promptTokens: number;
  completionTokens: number;
}
