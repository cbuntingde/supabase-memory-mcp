/**
 * Configuration Management for Supabase Memory MCP Server
 * Handles secure storage and retrieval of Supabase credentials
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export interface SupabaseConfig {
    projectUrl: string;
    anonKey: string;
    serviceRoleKey?: string;
}

/**
 * Get the configuration file path
 * Stored in user's home directory for security
 */
export function getConfigPath(): string {
    const configDir = join(homedir(), '.config', 'supabase-memory-mcp');
    return join(configDir, 'config.json');
}

/**
 * Load configuration from file
 * @returns Configuration object or null if not found
 */
export function loadConfig(): SupabaseConfig | null {
    const configPath = getConfigPath();

    if (!existsSync(configPath)) {
        return null;
    }

    try {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as SupabaseConfig;

        if (!config.projectUrl || !config.anonKey) {
            return null;
        }

        return config;
    } catch (error) {
        console.error('Error loading config:', error);
        return null;
    }
}

/**
 * Save configuration to file
 * @param config - Configuration to save
 */
export function saveConfig(config: SupabaseConfig): void {
    const configPath = getConfigPath();
    const configDir = dirname(configPath);

    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }

    // Write config with restricted permissions concept (JSON format)
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Get configuration from environment variables
 * Environment variables take precedence over config file
 */
export function getConfigFromEnv(): Partial<SupabaseConfig> {
    return {
        projectUrl: process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
}

/**
 * Get merged configuration (env vars override file config)
 */
export function getConfig(): SupabaseConfig | null {
    const fileConfig = loadConfig();
    const envConfig = getConfigFromEnv();

    // Environment variables take precedence
    const merged: Partial<SupabaseConfig> = {
        ...fileConfig,
        ...Object.fromEntries(
            Object.entries(envConfig).filter(([_, v]) => v !== undefined)
        ),
    };

    // Check if we have all required fields
    if (!merged.projectUrl || !merged.anonKey) {
        return null;
    }

    return merged as SupabaseConfig;
}

/**
 * Validate Supabase URL format
 */
export function isValidSupabaseUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Allow any format now, but check protocol
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}


