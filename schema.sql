-- ═══════════════════════════════════════════════════════════════════════════════
-- Supabase Memory MCP Server - Database Schema
-- Run this SQL in your Supabase SQL Editor (https://app.supabase.com)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable pgvector extension (required for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. EPISODIC & LEARNING MEMORY (The "Core" Memory)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT,                  -- 'tech_stack', 'decision', 'workout_log', etc.
    content TEXT NOT NULL,
    embedding vector(384),          -- Xenova/all-MiniLM-L6-v2 dimension
    metadata JSONB DEFAULT '{}',
    
    -- New columns for enhanced memory types
    type TEXT DEFAULT 'episodic',   -- 'episodic', 'insight' (learned patterns), 'procedure'
    importance INTEGER DEFAULT 1,   -- 1 (routine) to 5 (core memory/critical)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ASSOCIATIVE MEMORY (The "Knowledge Graph")
-- Links memories together to form a graph (e.g., "A causes B", "X relates to Y")
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memory_relations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,    -- 'caused_by', 'related_to', 'contradicts', 'supports'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate edges
    UNIQUE(source_id, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_relations_source ON memory_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON memory_relations(target_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. STRUCTURED (ENTITY) MEMORY & PROJECT PROFILES
-- Exact key-value storage for specific entities (User, Project, System Configs)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS structured_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL,         -- context
    category TEXT NOT NULL,           -- 'user_profile', 'project_conf', 'api_schema'
    key TEXT NOT NULL,                -- 'username', 'preferred_language', 'deployment_url'
    value JSONB NOT NULL,             -- The actual data structure
    description TEXT,                 -- Description for humans/AI to understand what this setting is
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(project_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_structured_lookup ON structured_memories(project_id, category, key);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. SHORT-TERM MEMORY
-- Ephemeral storage for active session context
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS short_term_memory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Can be null if it expires on session end only
    
    UNIQUE(session_id, key)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Semantic Search (Updated to include type filtering)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(384),
    match_project_id TEXT,
    match_category TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    project_id TEXT,
    category TEXT,
    content TEXT,
    metadata JSONB,
    type TEXT,
    importance INT,
    created_at TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.project_id,
        m.category,
        m.content,
        m.metadata,
        m.type,
        m.importance,
        m.created_at,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.project_id = match_project_id
      AND (match_category IS NULL OR m.category = match_category)
      AND 1 - (m.embedding <=> query_embedding) >= match_threshold
    ORDER BY m.importance DESC, (m.embedding <=> query_embedding) ASC
    LIMIT match_count;
END;
$$;

-- Graph Traversal: Get Related Memories
CREATE OR REPLACE FUNCTION get_related_memories(
    start_id UUID
)
RETURNS TABLE (
    relation_type TEXT,
    direction TEXT,
    memory_id UUID,
    category TEXT,
    content TEXT,
    type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    -- Outgoing relations (I point to them)
    SELECT 
        r.relation_type,
        'outgoing' as direction,
        m.id as memory_id,
        m.category,
        m.content,
        m.type
    FROM memory_relations r
    JOIN memories m ON r.target_id = m.id
    WHERE r.source_id = start_id
    
    UNION ALL
    
    -- Incoming relations (They point to me)
    SELECT 
        r.relation_type,
        'incoming' as direction,
        m.id as memory_id,
        m.category,
        m.content,
        m.type
    FROM memory_relations r
    JOIN memories m ON r.source_id = m.id
    WHERE r.target_id = start_id;
END;
$$;

-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON memories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_structured_memories_updated_at ON structured_memories;
CREATE TRIGGER update_structured_memories_updated_at BEFORE UPDATE ON structured_memories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (Enable RLS for all new tables)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE structured_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_term_memory ENABLE ROW LEVEL SECURITY;

-- Simple permissive policies for now (User should adjust for prod)
CREATE POLICY "Public Access" ON memory_relations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON structured_memories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON short_term_memory FOR ALL USING (true) WITH CHECK (true);

-- Verification
DO $$
BEGIN
    RAISE NOTICE '✅ Comprehensive Memory Schema Created';
    RAISE NOTICE '   - Table: memories (Episodic + Insights)';
    RAISE NOTICE '   - Table: memory_relations (Graph)';
    RAISE NOTICE '   - Table: structured_memories (Entities/Projects)';
    RAISE NOTICE '   - Table: short_term_memory (Session)';
END $$;
-- Run this SQL in your Supabase SQL Editor (https://app.supabase.com)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable pgvector extension (required for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MEMORIES TABLE
-- Stores all memory entries with vector embeddings
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT,
    content TEXT NOT NULL,
    embedding vector(384),  -- Xenova/all-MiniLM-L6-v2 dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE memories IS 'Semantic memory storage for MCP server with vector embeddings';
COMMENT ON COLUMN memories.embedding IS 'Xenova/all-MiniLM-L6-v2 384-dimension vector';
COMMENT ON COLUMN memories.project_id IS 'Unique project identifier for memory isolation';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- Optimized for common query patterns
-- ═══════════════════════════════════════════════════════════════════════════════

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_memories_project_category ON memories(project_id, category);

-- HNSW index for fast semantic vector search
-- This provides approximate nearest neighbor search with excellent performance
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (Optional but Recommended)
-- Enable if you want to restrict access based on user authentication
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
-- Adjust this based on your security requirements
CREATE POLICY "Allow all operations for authenticated users" ON memories
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy: Allow all operations for service role (used by MCP server)
CREATE POLICY "Allow all operations for service role" ON memories
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Allow anon users (if using anon key)
CREATE POLICY "Allow all operations for anon users" ON memories
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEMANTIC SEARCH FUNCTION
-- This function enables fast vector similarity search
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(384),
    match_project_id TEXT,
    match_category TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 5
)
    RETURNS TABLE (
    id UUID,
    project_id TEXT,
    category TEXT,
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.project_id,
        m.category,
        m.content,
        m.metadata,
        m.created_at,
        m.updated_at,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.project_id = match_project_id
      AND (match_category IS NULL OR m.category = match_category)
      AND 1 - (m.embedding <=> query_embedding) >= match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_memories IS 'Semantic similarity search using cosine distance';

-- ═══════════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- Automatically updates the updated_at timestamp on row changes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTION (Optional)
-- Removes old memories to manage storage
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_memories(
    older_than_days INT DEFAULT 90,
    target_project_id TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INT;
BEGIN
    WITH deleted AS (
        DELETE FROM memories
        WHERE created_at < NOW() - (older_than_days || ' days')::INTERVAL
          AND (target_project_id IS NULL OR project_id = target_project_id)
        RETURNING *
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_memories IS 'Removes memories older than specified days';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Run this to verify the setup is complete
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE '✅ Schema creation complete!';
    RAISE NOTICE '   - Table: memories';
    RAISE NOTICE '   - Function: match_memories (semantic search)';
    RAISE NOTICE '   - Function: cleanup_old_memories';
    RAISE NOTICE '   - Trigger: update_memories_updated_at';
    RAISE NOTICE '   - Indexes: HNSW for vectors, B-tree for filters';
END $$;