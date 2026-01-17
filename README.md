# Supabase Memory MCP Server

> [!IMPORTANT]
> **Prerequisites for Use**
> 
> To ensure efficient operation and connectivity with Supabase, please verify the following:
>
> 1. **Rule Configuration**: You **must** add the defined operational rules to your editor or extension's system prompt (e.g., `.clinerules`). See [System Prompts](#2-system-prompts-clinerules).
> 2. **MCP Configuration**: The `mcp.json` file must be strictly configured as detailed in the [MCP Client Configuration](#mcp-client-configuration) section.
> 3. **Tool Authorization**: For users of **Cline**, **Roo Code**, **Kilo Code**, or similar extensions: You **must enable all tool permissions** (check all boxes) upon initialization. Failure to approve these tools will prevent the server from authenticating and connecting to the Supabase instance.

🧠 **Enterprise-grade Cognitive Memory Architecture using Supabase with pgvector**

An MCP (Model Context Protocol) server that provides AI assistants with a multi-layered memory system. It goes beyond simple embeddings to support Graph (Associative), Structured (Entity), and Short-Term (Session) memory.

## Features

- 🔍 **Semantic/Episodic Memory** - vectorized storage for "What happened?"
- 🕸️ **Graph/Associative Memory** - link memories (`caused_by`, `related_to`) for deep reasoning.
- 🗃️ **Structured Memory** - strictly typed Key-Value store for Project Configs & User Profiles.
- 📝 **Short-Term Memory** - ephemeral storage for active sessions.
- ⚡ **Fast Retrieval** - HNSW vector indexes & Postgres performance.
- 🔐 **Secure Storage** - Row Level Security ready.

## Quick Start

 ### 1. Run Setup
 
 The interactive setup will guide you through configuring your Supabase connection and creating the database schema:
 
 ```bash
 npx --package @gsxrchris/supabase-memory supabase-memory setup
 ```
 
 You'll need:
 - **Supabase Project URL** (e.g., `https://xxxxx.supabase.co`)
 - **Supabase Anon/Public API Key** (Select API Keys on left side, click legacy tab for key)
 
 ### 2. Configure MCP Client
 
 Add the server to your `mcp.json` or `claude_desktop_config.json`:
 
 ```json
 {
   "mcpServers": {
     "supabase-memory": {
       "command": "npx",
       "args": [
         "-y",
         "--package",
         "@gsxrchris/supabase-memory",
         "supabase-memory"
       ]
     }
   }
 }
 ```

## Available Tools

### 1. Episodic & Insight Memory (Core)

**`store_memory`**
Store a new memory with semantic embedding. Now supports importance classification.
```typescript
{
  content: string,      // The text content to remember
  category: string,     // e.g., 'tech_stack', 'decision', 'workout_log'
  project_id: string,   // Unique project identifier
  type: string,         // 'episodic' or 'insight' (learned truth)
  importance: number,   // 1 (routine) to 5 (critical)
  metadata?: object     // Optional additional data
}
```

**`search_memories`**
Semantic search across stored memories.
```typescript
{
  query: string,                  // Natural language search query
  project_id: string,             // Filter by project
  category?: string,              // Optional category filter
  limit?: number,                 // Max results (1-50, default: 5)
  similarity_threshold?: number   // Min similarity (0-1, default: 0.5)
}
```

### 2. Associative (Graph) Memory

**`create_reaction`**
Link two memories together to form a knowledge graph.
```typescript
{
  source_id: string,    // UUID of the source memory
  target_id: string,    // UUID of the target memory
  relation_type: string // e.g., 'caused_by', 'depends_on', 'contradicts'
}
```

**`get_related_memories`**
Traverse the graph to find connected memories.
```typescript
{
  memory_id: string     // UUID of the memory to investigate
}
```

### 3. Structured (Entity) Memory

**`set_structured_memory`**
Store exact facts about entities or the project config.
```typescript
{
  project_id: string,
  category: string,     // e.g. 'user_profile', 'project_conf'
  key: string,          // e.g. 'theme', 'deploy_url'
  value: any,           // JSON value
  description?: string
}
```

**`get_structured_memory`**
Retrieve a specific fact.
```typescript
{
  project_id: string,
  category: string,
  key: string
}
```

### 4. Short-Term Memory

**`set_short_term_memory`**
Session-based scratchpad.
```typescript
{
  session_id: string,
  key: string,
  value: any,
  ttl_seconds?: number  // Auto-expire after N seconds
}
```

**`get_short_term_memory`**
Retrieve session data. Returns null if expired.
```typescript
{
  session_id: string,
  key: string
}
```

## AI Assistant Configuration

### System Prompts (`.clinerules`)

**Recommended System Prompt / Custom Instructions:**

```markdown
# Cognitive Memory Rules

You are equipped with a multi-layered memory system (Supabase + pgvector).

## 1. Episodic Memory (Experience)
- Use `store_memory` for events, decisions, and outcomes.
- Use `type='insight'` and `importance=5` for "Lessons Learned" or "Root Cause Analysis".

## 2. Associative Memory (Reasoning)
- When you discover that Memory A (Bug) was caused by Memory B (Config Change), use `create_reaction(source=A, target=B, relation='caused_by')`.
- This builds a Knowledge Graph we can traverse later.

## 3. Structured Memory (Facts)
- **Do not** use vector search for specific config values (e.g. "What is the API Key?").
- Use `set_structured_memory` for specific, hard facts like User Preferences, Project Configuration, or API Schemas.

## 4. Short-Term Memory (Context)
- Use `set_short_term_memory` for temporary context (e.g. "current_file_focus", "user_mood") that doesn't need to persist beyond the session.
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run setup wizard
npm run setup
```

## License

MIT
