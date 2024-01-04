CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE tenants
(
    id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name    TEXT,
    credits BIGINT DEFAULT 0
);

CREATE TABLE users
(
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                 VARCHAR(255) NOT NULL UNIQUE,
    name                  TEXT,

    -- Preferences
    ui_show_prompts       BOOLEAN          default true,
    ui_show_conversations BOOLEAN          default true,
    selected_tenant_id    UUID REFERENCES tenants (id)
);

CREATE TABLE user_tenants
(
    user_id   UUID REFERENCES users (id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants (id),
    PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE oauth_tokens
(
    id               UUID PRIMARY KEY      DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users (id) ON DELETE CASCADE,
    provider         VARCHAR(255) NOT NULL DEFAULT 'google',
    provider_user_id VARCHAR(255) NOT NULL,
    access_token     TEXT,
    id_token         TEXT,
    refresh_token    TEXT,
    token_expiry     TIMESTAMP
);

CREATE TABLE documents
(
    id           UUID PRIMARY KEY,
    content      TEXT      NOT NULL,
    source_url   TEXT,
    content_hash VARCHAR(64),
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL,

    -- sharding prep
    user_id     UUID REFERENCES users (id),
    tenant_id   UUID REFERENCES tenants (id)
);

CREATE TABLE snippets
(
    id          SERIAL PRIMARY KEY,
    document_id UUID REFERENCES documents (id),
    start_index INT          NOT NULL,
    end_index   INT          NOT NULL,
    token_count INT          NOT NULL,
    vector      VECTOR(1536) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL,

    -- sharding prep
    user_id     UUID REFERENCES users (id),
    tenant_id   UUID REFERENCES tenants (id)
);

CREATE TABLE conversations
(
    id          UUID PRIMARY KEY,
    document_id UUID REFERENCES documents (id),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    folder_id   UUID,
    name        VARCHAR(255),
    prompt      TEXT,
    temperature FLOAT,
    model_id    VARCHAR(255),
    user_id     UUID REFERENCES users (id) ON DELETE CASCADE,
    tenant_id   UUID REFERENCES tenants (id),
    system_memory  TEXT
);

CREATE TABLE messages
(
    id                  UUID PRIMARY KEY,
    role                VARCHAR(255) NOT NULL,
    content             TEXT,
    name                TEXT,
    conversation_id     UUID REFERENCES conversations (id) ON DELETE CASCADE,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    compressed_content  TEXT,
    function_name       VARCHAR(255), -- new column
    function_arguments  TEXT, -- new column

    -- sharding prep
    user_id             UUID REFERENCES users (id),
    tenant_id           UUID REFERENCES tenants (id)
);

CREATE TABLE folders
(
    id        UUID PRIMARY KEY,
    name      TEXT,

-- sharding prep
    user_id   UUID REFERENCES users (id),
    tenant_id UUID REFERENCES tenants (id)
);

CREATE TABLE waitlist_items (
    id UUID DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email TEXT NOT NULL,
    PRIMARY KEY(id)
);

CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");


CREATE TABLE jupyter_settings
(
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID REFERENCES users (id) ON DELETE CASCADE,
    host                  VARCHAR(255),
    port                  INTEGER,
    token                 VARCHAR(255),
    notebooks_folder_path VARCHAR(255)
);

ALTER TABLE jupyter_settings 
ADD CONSTRAINT fk_jupyter_settings_user_id 
FOREIGN KEY (user_id) 
REFERENCES users(id);

CREATE TABLE conversation_notebook
(
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID UNIQUE REFERENCES conversations (id) ON DELETE CASCADE,
    notebook_path   VARCHAR(255),
    notebook_name   VARCHAR(255),
    session_id      VARCHAR(255),
    kernel_id       VARCHAR(255)
);

CREATE TABLE api_usage
(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants (id),
  user_id UUID REFERENCES users (id),
  conversation_id UUID REFERENCES conversations (id) ON DELETE CASCADE,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  is_deducted BOOLEAN DEFAULT FALSE,
  credits INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices
(
    invoice_id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id)
);