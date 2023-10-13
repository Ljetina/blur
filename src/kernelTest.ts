// @ts-nocheck
import http from 'node:http';
import WebSocket from 'ws';

// Define the URL of the Jupyter Kernel Gateway
const gatewayUrl = '127.0.0.1';
const port = 8888;
const token = 'test';

// Define the code to be executed
const code = 'print("Hello, World!")';

// Function to create a new kernel
function createKernel(callback) {
  const options = {
    hostname: gatewayUrl,
    port: port,
    path: '/api/kernels?token=your_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      console.log(rawData);
      callback(JSON.parse(rawData).id);
    });
  });

  req.on('error', (error) => {
    console.error(`Problem with request: ${error.message}`);
  });

  req.end();
}

function listKernels(callback) {
  const options = {
    hostname: gatewayUrl,
    port: port,
    path: '/api/kernels?token=test',
    method: 'GET',
  };

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      console.log(rawData);
      callback(JSON.parse(rawData));
    });
  });

  req.on('error', (error) => {
    console.error(`Problem with request: ${error.message}`);
  });

  req.end();
}

function listSessions(callback) {
  const options = {
    hostname: gatewayUrl,
    port: port,
    path: '/api/sessions?token=test',
    method: 'GET',
  };

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      callback(JSON.parse(rawData));
    });
  });

  req.on('error', (error) => {
    console.error(`Problem with request: ${error.message}`);
  });

  req.end();
}

// Function to connect to a kernel
function connectToKernel(kernelId, callback) {
  const token = 'test'; // Replace with your actual token
  const options = {
    hostname: gatewayUrl,
    port: port,
    path: `/api/kernels/${kernelId}?token=${token}`,
    method: 'GET',
  };

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      console.log(rawData);
      callback(JSON.parse(rawData));
    });
  });

  req.on('error', (error) => {
    console.error(`Problem with request: ${error.message}`);
  });

  req.end();
}

// Main function to connect to a kernel
// connectToKernel('magicm', (kernelInfo) => {
//   console.log(kernelInfo);
// });

async function executeCode(kernelId, code) {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `ws://${gatewayUrl}:${port}/api/kernels/${kernelId}/channels`
    );

    ws.on('open', function open() {
      const executeRequest = {
        header: {
          msg_id: `execute_${new Date().getTime()}`,
          username: '',
          session: '00000000-0000-0000-0000-000000000000',
          msg_type: 'execute_request',
          version: '5.2',
        },
        parent_header: {},
        metadata: {},
        content: {
          code: code,
          silent: false,
          store_history: true,
          user_expressions: {},
          allow_stdin: false,
        },
      };

      ws.send(JSON.stringify(executeRequest));
    });

    ws.on('end', function incoming() {
      console.log('END');
    });

    ws.on('message', function incoming(data) {
      console.log('MESSAGE');
      callback(JSON.parse(data));
    });
  });
}

const sessionId = '939d8874-8ba3-465c-a0bc-1c78d0d5dccc';

// // Main function to create a kernel and execute code
// createKernel((kernelId) => {
//   executeCode(kernelId, code, (result) => {
//     console.log(result);
//   });
// });
// listKernels((kernels) => {
//   console.log(kernels);
// });

listSessions((sessions) => {
  console.log(JSON.stringify(sessions));
  const sessionId = sessions[0].id;
  const kernelId = sessions[0].kernel.id;
  const notebookPath = sessions[0].notebook.path;
  console.log({ sessionId, kernelId, notebookPath });

  let state = 'busy';

  const ws = new WebSocket(
    `ws://127.0.0.1:8888/api/kernels/${kernelId}/channels?session_id=${sessionId}&token=test`
  );
  ws.on('open', async () => {
    console.log('opened');
    // getNotebookContents(notebookPath);
    console.log(await getNotebooks());
    // addCell(notebookPath);
  });
  ws.on('message', (m) => {
    const message = JSON.parse(m);
    // console.log(message);
  });
});

const axios = require('axios');

async function getNotebookContents(_notebookPath) {
  // Replace with your actual token
  const notebookPath = 'notebooks/islandfox.ipynb';
  try {
    const response = await axios.get(
      `http://localhost:8888/api/contents/${notebookPath}?token=${token}`
    );
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching notebook:', error);
    // Depending on your use case, you might want to throw the error, return null, or handle it some other way
    return null;
  }
}

async function getNotebooks(foundNotebooks = [], directory = 'notebooks') {
  const url = directory
    ? `http://localhost:8888/api/contents/${directory}?token=${token}`
    : `http://localhost:8888/api/contents?token=${token}`;
  try {
    const response = await axios.get(url);
    const content = response.data.content;
    for (const c of content) {
      if (c.type === 'notebook') {
        foundNotebooks.push([c.name, c.path]);
      }
    }
    return foundNotebooks;
  } catch (error) {
    console.error('Error fetching notebook:', error);
    // Depending on your use case, you might want to throw the error, return null, or handle it some other way
    return null;
  }
}
