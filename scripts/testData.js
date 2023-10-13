const { Client } = require('pg');
const uuid = require('uuid');
const dotenv = require('dotenv');
dotenv.config();

// Update these with your connection parameters
const client = new Client({
  connectionString: process.env.PG_DB_URL,
});

client.connect();

// Define your UUIDs
const userId = '2b802813-86f0-4130-a06b-7e1775350592';
const tenantId = 'ec224ff1-0f67-4164-8d06-37692f134c3a';
const conversationId = 'e7d88631-754f-413b-a1c2-b412fcb391c9';

// Define the start date
let date = new Date();

// Function to generate an SQL query for a single message
function generateQuery(i) {
  // Increment the date by one second
  date.setSeconds(date.getSeconds() + 1);

  const id = uuid.v4();
  const role = 'test_role';
  const content = `Test content ${i}`;
  const name = 'Test name';
  const createdAt = date.toISOString();
  const updatedAt = date.toISOString();
  const compressedContent = `Test compressed content ${i}`;

  return `
    INSERT INTO messages
    (id, role, content, name, conversation_id, created_at, updated_at, compressed_content, user_id, tenant_id)
    VALUES
    ('${id}', '${role}', '${content}', '${name}', '${conversationId}', '${createdAt}', '${updatedAt}', '${compressedContent}', '${userId}', '${tenantId}');
  `;
}

// Generate and execute the queries
let promises = [];
for (let i = 1; i <= 1000; i++) {
  const query = generateQuery(i + 100);
  promises.push(client.query(query));
}

Promise.all(promises)
  .then(() => {
    console.log('All rows inserted');
    return client.end();
  })
  .catch((err) => {
    console.error(err);
    return client.end();
  });
