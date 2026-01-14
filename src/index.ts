#!/usr/bin/env node
/**
 * Supabase Memory MCP Server
 * Enterprise-grade semantic memory storage using Supabase with pgvector
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEmbedding } from "./embedding.js";
import { getConfig } from "./config.js";
import { runSetup } from "./setup.js";

// Check for setup command
if (process.argv.includes('setup')) {
    await runSetup();
    process.exit(0);
}

// Initialize configuration
const config = getConfig();

if (!config) {
    console.error("❌ Configuration not found. Please run 'npx @gsxrchris/supabase-memory setup'");
    process.exit(1);
}

// Initialize clients
const supabase: SupabaseClient = createClient(
    config.projectUrl,
    config.serviceRoleKey || config.anonKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Initialize MCP Server
const server = new McpServer({
    name: "supabase-memory",
    version: "1.0.0",
});


/**
 * Format embedding array for Supabase pgvector
 */
function formatEmbedding(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MCP TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
    "store_memory",
    {
        content: z.string().describe("The text content to remember"),
        category: z.string().describe("Category (e.g., 'tech_stack', 'decision', 'snippet')"),
        project_id: z.string().describe("Unique identifier for the project"),
        metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
    },
    async ({ content, category, project_id, metadata }) => {
        try {
            const embedding = await getEmbedding(content);

            const insertData = {
                project_id,
                category,
                content,
                embedding: formatEmbedding(embedding),
                metadata: metadata || {},
            };

            const { data, error } = await supabase
                .from("memories")
                .insert(insertData)
                .select("id, created_at")
                .single();

            if (error) throw new Error(`Supabase error: ${error.message}`);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            message: `Memory stored successfully`,
                            memory_id: data.id,
                            project_id,
                        }, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${String(error)}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    "search_memories",
    {
        query: z.string().describe("The semantic query to search for"),
        project_id: z.string().describe("Filter by project ID"),
        category: z.string().optional(),
        limit: z.number().min(1).max(50).optional().default(5),
        similarity_threshold: z.number().min(0).max(1).optional().default(0.5),
    },
    async ({ query, project_id, category, limit, similarity_threshold }) => {
        try {
            const queryEmbedding = await getEmbedding(query);

            const { data, error } = await supabase.rpc("match_memories", {
                query_embedding: formatEmbedding(queryEmbedding),
                match_project_id: project_id,
                match_category: category || null,
                match_threshold: similarity_threshold,
                match_count: limit,
            });

            if (error) {
                // Fallback or specific error handling
                throw new Error(`Supabase error: ${error.message}`);
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            results: data,
                        }, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${String(error)}` }],
                isError: true,
            };
        }
    }
);

// ... other tools (list_memories, delete_memory, get_project_stats) remain strictly Supabase-based
// Adding them back briefly to keep file complete but focused on the diff for embeddings

server.tool(
    "list_memories",
    {
        project_id: z.string(),
        category: z.string().optional(),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
    },
    async ({ project_id, category, limit, offset }) => {
        let query = supabase
            .from("memories")
            .select("id, category, content, created_at")
            .eq("project_id", project_id)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (category) query = query.eq("category", category);

        const { data, error } = await query;
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };

        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
);

server.tool(
    "delete_memory",
    { memory_id: z.string(), project_id: z.string() },
    async ({ memory_id, project_id }) => {
        const { error } = await supabase.from("memories").delete().eq("id", memory_id).eq("project_id", project_id);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: "Memory deleted" }] };
    }
);

server.tool(
    "get_project_stats",
    { project_id: z.string() },
    async ({ project_id }) => {
        const { count, error } = await supabase.from("memories").select("*", { count: 'exact', head: true }).eq("project_id", project_id);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify({ total_memories: count }) }] };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🧠 Supabase Memory MCP Server started");
}

main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});
