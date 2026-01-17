
import chalk from 'chalk';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export class Logger {
    private level: LogLevel;
    private name: string;

    constructor(name: string, level: LogLevel = LogLevel.INFO) {
        this.name = name;
        this.level = level;
    }

    private formatMessage(level: string, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${this.name}] [${level}] ${message}${metaStr}`;
    }

    debug(message: string, meta?: any) {
        if (this.level <= LogLevel.DEBUG) {
            console.debug(chalk.gray(this.formatMessage('DEBUG', message, meta)));
        }
    }

    info(message: string, meta?: any) {
        if (this.level <= LogLevel.INFO) {
            console.info(chalk.blue(this.formatMessage('INFO', message, meta)));
        }
    }

    warn(message: string, meta?: any) {
        if (this.level <= LogLevel.WARN) {
            console.warn(chalk.yellow(this.formatMessage('WARN', message, meta)));
        }
    }

    error(message: string, error?: any) {
        if (this.level <= LogLevel.ERROR) {
            const errorStr = error instanceof Error ? error.stack || error.message : JSON.stringify(error);
            console.error(chalk.red(this.formatMessage('ERROR', message)) + '\n' + chalk.red(errorStr));
        }
    }
}

export const logger = new Logger('SupabaseMemory');
