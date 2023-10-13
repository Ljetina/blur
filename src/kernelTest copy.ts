const axios = require('axios');
import WebSocket from 'ws';

// Replace with your actual token
const gatewayUrl = '127.0.0.1';
const port = 8888;
const token = 'test';
const kernelId = '48fec4e0-c726-401b-b324-d2b6b10bddcd';
const sessionId = '6bbdeaed-1624-4938-8ef6-f41f7987468b';
const notebookPath = 'notebooks/islandfox.ipynb';

// Fetch notebook content
async function getNotebookContent(notebookPath: string) {
  try {
    const response = await axios.get(
      `http://localhost:8888/api/contents/${notebookPath}?token=${token}`
    );
    return response.data.content;
  } catch (error) {
    console.error('Error fetching notebook:', error);
    return null;
  }
}

// Update notebook content
async function updateNotebookContent(notebookPath: string, content: any) {
  try {
    return await axios.put(
      `http://localhost:8888/api/contents/${notebookPath}?token=${token}`,
      {
        content: content,
        type: 'notebook',
      }
    );
  } catch (error) {
    console.error('Error updating notebook:', error);
  }
}

async function addCell(
  notebookPath: string,
  cellType: 'code' | 'markdown',
  content: any,
  index = null
) {
  const newCell = {
    cell_type: cellType,
    // execution_count: 53,
    metadata: { trusted: true },
    outputs: [],
    source: JSON.stringify(content),
  };
  if (index) {
  } else {
    content.cells.push(newCell);
  }
  return await updateNotebookContent(notebookPath, content);
}

let lastTaskPromise = Promise.resolve(); // Start with a resolved promise

function queueTask(task: any) {
  lastTaskPromise = lastTaskPromise.then(task).catch(task);
}

async function executeCell(
  notebookPath: string,
  kernelId: string,
  sessionId: string,
  content: any,
  cellIndex: number
) {
  const responseCache = {
    result: '',
  };
  return new Promise((resolve) => {
    // reset output
    content.cells[cellIndex].outputs = [];
    queueTask(updateNotebookContent(notebookPath, content));
    const ws = new WebSocket(
      `ws://${gatewayUrl}:${port}/api/kernels/${kernelId}/channels?token=${token}`
    );

    ws.on('open', function open() {
      const executeRequest = {
        header: {
          msg_id: `execute_${new Date().getTime()}`,
          username: '',
          session: sessionId,
          msg_type: 'execute_request',
          version: '5.2',
        },
        parent_header: {
          session: sessionId,
        },
        metadata: {},
        content: {
          code: content.cells[cellIndex].source,
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
      const m = JSON.parse(data.toString());
      // console.log('MESSAGE', m);
      if (m.msg_type == 'stream') {
        content.cells[cellIndex].outputs.push({
          name: 'stdout',
          output_type: 'stream',
          text: m.content.text + '',
        });
        queueTask(updateNotebookContent(notebookPath, content));
        responseCache.result += m.content.text;
      } else if (m.msg_type == 'execute_reply') {
        resolve(responseCache.result);
        ws.close();
      }
    });
  });
}

// Usage:
getNotebookContent(notebookPath)
  .then((content) => {
    if (content) {
      console.log(content.cells);
      return content;
    }
  })
  .then(async (content) => {
    const execResult = await executeCell(
      notebookPath,
      kernelId,
      sessionId,
      content,
      1
    );
    console.log(execResult);
    // content[content.length - 1].output =
    // return updateNotebookContent(notebookPath, )
  })
  .then(async () => {
    // Fetch the updated notebook content to get the output of the executed cell
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return getNotebookContent(notebookPath);
  })
  .then((content) => {
    if (content) {
      const lastCell = content.cells[content.cells.length - 1];
      console.log('Output of the last cell:', lastCell.outputs);
    }
  })
  .catch((error) => console.error(error));
