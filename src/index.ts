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
    version: "2.0.0",
});


/**
 * Format embedding array for Supabase pgvector
 */
function formatEmbedding(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. EPISODIC / INSIGHT MEMORY TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
    "store_memory",
    {
        content: z.string().describe("The text content to remember"),
        category: z.string().describe("Category (e.g., 'tech_stack', 'decision', 'workout_log')"),
        project_id: z.string().describe("Unique identifier for the project"),
        type: z.enum(['episodic', 'insight', 'procedure']).optional().default('episodic').describe("Type of memory: 'episodic' (routine), 'insight' (learned truth), 'procedure' (how-to)"),
        importance: z.number().min(1).max(5).optional().default(1).describe("Importance level (1-5)"),
        metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
    },
    async ({ content, category, project_id, type, importance, metadata }) => {
        try {
            const embedding = await getEmbedding(content);

            const insertData = {
                project_id,
                category,
                content,
                embedding: formatEmbedding(embedding),
                type,
                importance,
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
                            type
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

            if (error) throw new Error(`Supabase error: ${error.message}`);

            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, results: data }, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${String(error)}` }],
                isError: true,
            };
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// 2. ASSOCIATIVE (GRAPH) MEMORY TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
    "create_reaction",
    {
        source_id: z.string().describe("UUID of the source memory"),
        target_id: z.string().describe("UUID of the target memory"),
        relation_type: z.string().describe("Type of relation, e.g., 'caused_by', 'relates_to', 'contradicts'"),
    },
    async ({ source_id, target_id, relation_type }) => {
        try {
            const { error } = await supabase
                .from("memory_relations")
                .insert({ source_id, target_id, relation_type });

            if (error) throw error;
            return { content: [{ type: "text", text: `Relation '${relation_type}' created between ${source_id} and ${target_id}` }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

server.tool(
    "get_related_memories",
    {
        memory_id: z.string().describe("UUID of the memory to investigate"),
    },
    async ({ memory_id }) => {
        try {
            const { data, error } = await supabase.rpc("get_related_memories", { start_id: memory_id });
            if (error) throw error;
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// 3. STRUCTURED (ENTITY) MEMORY TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
    "set_structured_memory",
    {
        project_id: z.string(),
        category: z.string().describe("Group, e.g. 'user_profile', 'project_conf'"),
        key: z.string().describe("Unique key within category, e.g. 'theme'"),
        value: z.any().describe("JSON value to store"),
        description: z.string().optional().describe("Description of what this is"),
    },
    async ({ project_id, category, key, value, description }) => {
        try {
            const { error } = await supabase.from("structured_memories").upsert(
                { project_id, category, key, value, description },
                { onConflict: 'project_id,category,key' }
            );
            if (error) throw error;
            return { content: [{ type: "text", text: `Structured memory saved: ${category}.${key}` }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

server.tool(
    "get_structured_memory",
    {
        project_id: z.string(),
        category: z.string(),
        key: z.string(),
    },
    async ({ project_id, category, key }) => {
        try {
            const { data, error } = await supabase
                .from("structured_memories")
                .select("value, description")
                .match({ project_id, category, key })
                .single();

            if (error) return { content: [{ type: "text", text: "Not found" }] };
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// 4. SHORT-TERM MEMORY TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
    "set_short_term_memory",
    {
        session_id: z.string().describe("Current user session ID"),
        key: z.string(),
        value: z.any(),
        ttl_seconds: z.number().optional().describe("Time to live in seconds (optional)"),
    },
    async ({ session_id, key, value, ttl_seconds }) => {
        try {
            let expires_at: string | null = null;
            if (ttl_seconds) {
                const d = new Date();
                d.setSeconds(d.getSeconds() + ttl_seconds);
                expires_at = d.toISOString();
            }

            const { error } = await supabase.from("short_term_memory").upsert(
                { session_id, key, value, expires_at },
                { onConflict: 'session_id,key' }
            );

            if (error) throw error;
            return { content: [{ type: "text", text: `Short-term memory set: ${key}` }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

server.tool(
    "get_short_term_memory",
    {
        session_id: z.string(),
        key: z.string(),
    },
    async ({ session_id, key }) => {
        try {
            // Check for expiration
            const { data, error } = await supabase
                .from("short_term_memory")
                .select("value, expires_at")
                .match({ session_id, key })
                .single();

            if (error || !data) return { content: [{ type: "text", text: "null" }] };

            if (data.expires_at && new Date(data.expires_at) < new Date()) {
                // Expired, delete it lazily
                await supabase.from("short_term_memory").delete().match({ session_id, key });
                return { content: [{ type: "text", text: "null (expired)" }] };
            }

            return { content: [{ type: "text", text: JSON.stringify(data.value, null, 2) }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY TOOLS
// ══════════════════════════════════════════════════════════════════════════════

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
            .select("id, category, content, created_at, type, importance")
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
        // Just a simple count for now
        const { count, error } = await supabase.from("memories").select("*", { count: 'exact', head: true }).eq("project_id", project_id);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify({ total_memories: count }) }] };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🧠 Supabase Memory MCP Server v2.0 started");
}

main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});

