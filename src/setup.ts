#!/usr/bin/env node
/**
 * Interactive Setup for Supabase Memory MCP Server
 * Guides users through configuration with validation and automatic DB setup
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import {
    saveConfig,
    loadConfig,
    isValidSupabaseUrl,
    getConfigPath,
    type SupabaseConfig
} from './config.js';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ${chalk.cyan.bold('🧠 Supabase Memory MCP Server')}                              ║
║   ${chalk.gray('Semantic memory storage with pgvector')}                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function getProjectRef(url: string): Promise<string | null> {
    try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split('.');
        if (parts.length >= 3) {
            return parts[0];
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function runMigrations(connectionString: string): Promise<boolean> {
    console.log(chalk.yellow('\n⏳ Connecting to database to apply schema...'));

    const client = new pg.Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // Locate schema.sql
        const possiblePaths = [
            path.join(process.cwd(), 'schema.sql'),
            path.join(__dirname, '..', 'schema.sql'),
            path.join(__dirname, '../..', 'schema.sql')
        ];

        let schemaPath = possiblePaths.find(p => fs.existsSync(p));

        if (!schemaPath) {
            console.log(chalk.red('❌ Could not find schema.sql file.'));
            return false;
        }

        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log(chalk.gray(`   Reading schema from ${schemaPath}`));
        await client.query(sql);

        console.log(chalk.green('✅ Database schema applied successfully!'));

        return true;
    } catch (error) {
        console.log(chalk.red(`❌ Failed to apply database schema: ${error}`));
        return false;
    } finally {
        await client.end().catch(() => { });
    }
}

async function testConnection(config: SupabaseConfig): Promise<boolean> {
    console.log(chalk.yellow('\n⏳ Testing API connection...'));

    try {
        const supabase = createClient(config.projectUrl, config.anonKey);
        const { error } = await supabase.from('memories').select('count').limit(1);

        if (error) {
            if (error.code === '42P01' || error.message.includes('relation "memories" does not exist')) {
                console.log(chalk.yellow('⚠️  API Connected, but tables missing.'));
                return true;
            }
            if (error.code === '42501' || error.message.includes('permission denied')) {
                console.log(chalk.yellow('⚠️  API Connected, check RLS policies.'));
                return true;
            }
            console.log(chalk.red(`❌ Connection test failed: ${error.message}`));
            return false;
        }

        console.log(chalk.green('✅ API Connection successful!'));
        return true;
    } catch (error) {
        console.log(chalk.red(`❌ Connection failed: ${error}`));
        return false;
    }
}

export async function runSetup() {
    console.log(BANNER);

    const existingConfig = loadConfig();

    if (existingConfig) {
        console.log(chalk.green('✓ Existing configuration found at:'));
        console.log(chalk.gray(`  ${getConfigPath()}\n`));

        const { reconfigure } = await inquirer.prompt([{
            type: 'confirm',
            name: 'reconfigure',
            message: 'Would you like to reconfigure?',
            default: false
        }]);

        if (!reconfigure) process.exit(0);
    }

    console.log(chalk.cyan('Step 1: Supabase Configuration\n'));

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'projectUrl',
            message: 'Supabase Project URL:',
            default: existingConfig?.projectUrl || '',
            validate: (input) => isValidSupabaseUrl(input.trim()) ? true : 'Invalid URL'
        },
        {
            type: 'password',
            name: 'anonKey',
            message: 'Supabase Anon/Public API Key:',
            mask: '*',
            validate: (input) => input.trim().length > 5 ? true : 'Invalid Key'
        }
    ]);

    // DB Setup
    const projectRef = await getProjectRef(answers.projectUrl);
    let dbSetup = false;

    if (projectRef) {
        console.log(chalk.cyan('\nStep 2: Database Setup (Optional)'));
        const { shouldSetupDb } = await inquirer.prompt([{
            type: 'confirm',
            name: 'shouldSetupDb',
            message: 'Run automatic database migration?',
            default: true
        }]);

        if (shouldSetupDb) {
            const { dbPassword } = await inquirer.prompt([{
                type: 'password',
                name: 'dbPassword',
                message: 'Database Password:',
                mask: '*',
                validate: (input) => input.length > 0
            }]);

            const connectionString = `postgres://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
            dbSetup = await runMigrations(connectionString);
        }
    }



    const config: SupabaseConfig = {
        projectUrl: answers.projectUrl.trim(),
        anonKey: answers.anonKey.trim()
    };

    await testConnection(config);
    saveConfig(config);

    console.log(chalk.green(`\n✓ Configuration saved to: ${getConfigPath()}`));
    if (dbSetup) {
        console.log(chalk.green.bold('\n🚀 Setup complete! Server is ready.'));
    } else {
        console.log(chalk.yellow('\n⚠️  Database schema not applied automatically. Run schema.sql manually.'));
    }
}

// Check if running directly (ESM compatible)
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
    runSetup().catch((error) => {
        console.error(chalk.red('Setup failed:'), error);
        process.exit(1);
    });
}
