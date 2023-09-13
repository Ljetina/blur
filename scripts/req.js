const https = require('node:https');

const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    Authorization: 'Bearer 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',
    'Content-type': 'application/json',
  },
};

console.log(new Date())
const req = https.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  console.log('headers:', res.headers);
  res.on('close', () => {
    console.log(new Date())
    console.log('closed');
  });
  res.on('end', () => {
    console.log(new Date())
    console.log('end');
  });
  //   res.on('readable', (d) => {
  //     console.log('readable', res.read().toString('utf-8'));
  //   });
  res.on('data', (d) => {
    const rawChunk = d.toString('utf-8');
    const lines = rawChunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6, line.length)
        if (!payload.startsWith('[DONE]')) {
            console.log(JSON.parse(payload).choices);
        } else {
            console.log('[DONE]')
            console.log(new Date())
        }
        
      } else if (line.length > 0) {
        console.log('non data chunk', line);
      } else {
        // skip
      }
    }

    // console.log('data', d.toString('utf-8'));
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(
  JSON.stringify({
    model: 'gpt-3.5-turbo',
    // functions: [],
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: 'Hello!',
      },
    ],
    stream: true,
  })
);
req.end();
