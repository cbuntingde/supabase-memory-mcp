# Supabase Memory MCP Server

> [!IMPORTANT]
> **Prerequisites for Use**
> 
> To ensure efficient operation and connectivity with Supabase, please verify the following:
>
> 1. **Rule Configuration**: You **must** add the defined operational rules to your editor or extension's system prompt (e.g., `.clinerules`). See [System Prompts](#2-system-prompts-clinerules).
> 2. **MCP Configuration**: The `mcp.json` file must be strictly configured as detailed in the [MCP Client Configuration](#mcp-client-configuration) section.
> 3. **Tool Authorization**: For users of **Cline**, **Roo Code**, **Kilo Code**, or similar extensions: You **must enable all tool permissions** (check all boxes) upon initialization. Failure to approve these tools will prevent the server from authenticating and connecting to the Supabase instance.

🧠 **Enterprise-grade semantic memory storage using Supabase with pgvector**

An MCP (Model Context Protocol) server that provides AI assistants with persistent, semantically-searchable memory. Perfect for maintaining context across sessions and projects.

## Features

- 🔍 **Semantic Search** - Find relevant memories using natural language queries
- 📦 **Project Isolation** - Memories are scoped to individual projects
- 🏷️ **Category Organization** - Organize memories by type (decisions, tech_stack, snippets, etc.)
- ⚡ **Fast Retrieval** - HNSW vector indexes for millisecond search times
- 🔐 **Secure Storage** - Row Level Security ready with Supabase
- 🤖 **Local Embeddings** - Uses `Xenova/all-MiniLM-L6-v2` (384d) running locally for privacy and speed

## Quick Start
 
 ### 1. Run Setup
 
 The interactive setup will guide you through configuring your Supabase connection and creating the database schema:
 
 ```bash
 npx @gsxrchris/supabase-memory setup
 ```
 
 You'll need:
 - **Supabase Project URL** (e.g., `https://xxxxx.supabase.co`)
 - **Supabase Anon/Public API Key**
 
 ### 2. Configure MCP Client
 
 Add the server to your `mcp.json` or `claude_desktop_config.json`:
 
 ```json
 {
   "mcpServers": {
     "supabase-memory": {
       "command": "npx",
       "args": [
         "-y",
         "@gsxrchris/supabase-memory"
       ]
     }
   }
 }
 ```

## Configuration

### Environment Variables

You can configure the server using environment variables instead of the setup wizard:

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_PROJECT_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anon/public API key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | ❌ |


### Config File

The setup wizard saves configuration to:
- **Windows**: `%USERPROFILE%\.config\supabase-memory-mcp\config.json`
- **macOS/Linux**: `~/.config/supabase-memory-mcp/config.json`

Environment variables take precedence over the config file.

## MCP Client Configuration

Add this to your MCP client (e.g., Claude Desktop, Cline):

### Using Config File (Recommended)

{
  "mcpServers": {
    "supabase-memory": {
      "command": "npx",
      "args": ["-y", "@gsxrchris/supabase-memory"]
    }
  }
}

### Using Environment Variables

```json
{
  "mcpServers": {
    "supabase-memory": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "SUPABASE_PROJECT_URL": "https://xxxxx.supabase.co",
        "SUPABASE_ANON_KEY": "eyJ...",

      }
    }
  }
}
```

## Available Tools

### `store_memory`

Store a new memory with semantic embedding.

```typescript
{
  content: string,      // The text content to remember
  category: string,     // e.g., 'tech_stack', 'decision', 'snippet'
  project_id: string,   // Unique project identifier
  metadata?: object     // Optional additional data
}
```

### `search_memories`

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

### `list_memories`

List all memories for a project.

```typescript
{
  project_id: string,    // Filter by project
  category: string,      // Optional category filter
  limit?: number,        // Max results (1-100, default: 20)
  offset?: number        // Pagination offset (default: 0)
}
```

### `delete_memory`

Delete a specific memory.

```typescript
{
  memory_id: string,    // UUID of the memory
  project_id: string    // Project ID for verification
}
```

### `get_project_stats`

Get statistics about a project's memories.

```typescript
{
  project_id: string    // Project ID
}
```

## Usage Example

```
User: Remember that we're using TypeScript with strict mode for this project

AI: [Calls store_memory with content="Using TypeScript with strict mode enabled", 
     category="tech_stack", project_id="my-project"]

User: What tech decisions have we made?

AI: [Calls search_memories with query="tech decisions technology stack", 
     project_id="my-project"]
```

## AI Assistant Configuration

### 1. `mcp.json`

To use this server with Claude Desktop, Cline, or other MCP clients, add the following to your `mcp.json` configuration file:

```json
{
  "mcpServers": {
    "supabase-memory": {
      "command": "npx",
      "args": [
        "-y",
        "@gsxrchris/supabase-memory"
      ],
      "env": {
        "SUPABASE_PROJECT_URL": "Your Supabase URL (or set in .config)",
        "SUPABASE_ANON_KEY": "Your Anon Key (or set in .config)"
      }
    }
  }
}
```

### 2. System Prompts (`.clinerules`)

For the best experience, your AI assistant should be instructed on *how* to use its new memory tools. We provide a `.clinerules` file in the package that you can copy.

**Recommended System Prompt / Custom Instructions:**

```markdown
# Autonomous Memory Management Rules

You are equipped with a Supabase + pgvector memory system via MCP. You must manage this memory automatically to maintain long-term project awareness.

## Phase 1: Context Retrieval (Session Start)
- **BEFORE** starting any task, you MUST call `search_memories` using the current project path and task description as the query.
- Proactively look for:
  1. Past architectural decisions
  2. Specific tech stack quirks or "gotchas"
  3. Documentation for local modules you've built previously
  4. Previous errors and their solutions
  5. User preferences and coding style
- Integrate these findings into your initial plan before asking for user approval.

## Phase 2: In-Task Updates
- If the user makes a major pivot or a new technical standard is established (e.g., "We are switching from Fetch to Axios"), immediately call `store_memory` to log this change.
- Store memories with appropriate categories:
  - `tech_stack` - Libraries, frameworks, versions
  - `decision` - Architectural or design decisions
  - `snippet` - Useful code patterns or solutions
  - `architecture` - System structure and patterns
  - `gotcha` - Known issues and workarounds
  - `preference` - User preferences and style

## Phase 3: Task Conclusion (Automatic Upsert)
- Whenever a task is marked "Complete," you MUST call `store_memory` with a concise summary.
- Format the summary as follows:
  - **Outcome**: What was built or fixed.
  - **Decisions**: Key logic choices made (and why).
  - **Tech Stack**: Updated list of libraries or patterns used.
- Ensure the metadata includes relevant context.

## Constraints
- **Never** ask the user "Should I save this to the database?"—just do it as part of your cleanup routine.
- Use **semantic search** to find relevant context; do not rely on exact keyword matches.
- Keep memory content **concise** but **comprehensive** enough to be useful later.
- Use **project_id** consistently to maintain proper memory isolation.
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

## Project Structure

```
├── src/
│   ├── index.ts      # Main MCP server with tools
│   ├── config.ts     # Configuration management
│   └── setup.ts      # Interactive setup wizard
├── dist/             # Compiled JavaScript
├── schema.sql        # Supabase database schema
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### "Configuration not found"

Run the setup wizard:
```bash
npm run setup
```

### "memories table does not exist"

Run the schema.sql in your Supabase SQL Editor.

### Semantic search not working

Ensure you've created the `match_memories` function from schema.sql. The server will fall back to chronological listing if the function doesn't exist.

### RLS permission errors

If using the anon key, ensure RLS policies allow operations. The schema.sql includes permissive policies for testing.

## License

MIT
