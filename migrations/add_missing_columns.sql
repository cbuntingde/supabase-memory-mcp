-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add Missing Columns to Existing Database
-- Run this SQL in your Supabase SQL Editor (https://app.supabase.com)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add 'type' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'memories' 
        AND column_name = 'type'
    ) THEN
        ALTER TABLE memories ADD COLUMN type TEXT DEFAULT 'episodic';
        RAISE NOTICE 'Added column: memories.type';
    ELSE
        RAISE NOTICE 'Column memories.type already exists';
    END IF;
END $$;

-- Add 'importance' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'memories' 
        AND column_name = 'importance'
    ) THEN
        ALTER TABLE memories ADD COLUMN importance INTEGER DEFAULT 1;
        RAISE NOTICE 'Added column: memories.importance';
    ELSE
        RAISE NOTICE 'Column memories.importance already exists';
    END IF;
END $$;

-- Create index on type column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'memories' 
        AND indexname = 'idx_memories_type'
    ) THEN
        CREATE INDEX idx_memories_type ON memories(type);
        RAISE NOTICE 'Created index: idx_memories_type';
    ELSE
        RAISE NOTICE 'Index idx_memories_type already exists';
    END IF;
END $$;

-- Create index on importance column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'memories' 
        AND indexname = 'idx_memories_importance'
    ) THEN
        CREATE INDEX idx_memories_importance ON memories(importance);
        RAISE NOTICE 'Created index: idx_memories_importance';
    ELSE
        RAISE NOTICE 'Index idx_memories_importance already exists';
    END IF;
END $$;

-- Verify the changes
DO $$
BEGIN
    RAISE NOTICE '═════════════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ Migration Completed Successfully';
    RAISE NOTICE '   - Added/verified column: type';
    RAISE NOTICE '   - Added/verified column: importance';
    RAISE NOTICE '   - Added/verified index: idx_memories_type';
    RAISE NOTICE '   - Added/verified index: idx_memories_importance';
    RAISE NOTICE '═════════════════════════════════════════════════════════════════════════════';
END $$;
