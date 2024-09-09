### Islandfox.ai back-end service

This service interacts with the OpenAI API. It provides persistence for conversations into a PostgreSQL database and adds conversation enhancing features, such as RAG. It's main interface is a websocket connection, which allows the IslandFox.AI front-end to communicate bi-directionally with the back-end. This was an itch I needed to scratch, because the OpenAI API's server-sent events (SSE) is just kind of the wrong way to go about this.

### Dev running

```npm run dev```

### Building and Running

```
npm run build
node dist/index.js
```

See the Dockerfile for details.