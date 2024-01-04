import fs from 'node:fs';
import { startCompletionSimplified } from './lib/openai';

const payload = fs.readFileSync('./title_payload.json');
let stringPayload = payload.toString();
const parsedPayload = JSON.parse(stringPayload);

if (parsedPayload.messages.length > 8) {
    parsedPayload.messages = [parsedPayload.messages[0], parsedPayload.messages[1]].concat(parsedPayload.messages.slice(-11));
    // parsedPayload.messages = parsedPayload.messages.slice(0, -7);
}

stringPayload = JSON.stringify(parsedPayload);
console.log(JSON.parse(stringPayload));
console.log(parsedPayload.messages[parsedPayload.messages.length - 1])
startCompletionSimplified(stringPayload);

// {
//   "code": "train_df.head()",
//   "cell_type": "code"
// }