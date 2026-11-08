import { Injectable, LoggerService } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';

export interface LogContext {
  correlationId?: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  providerId?: string;
  [key: string]: unknown;
}

@Injectable()
export class PinoLoggerService implements LoggerService {
  protected readonly logger: PinoLogger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label: string) => {
          return { level: label.toUpperCase() };
        },
      },
    });
  }

  log(message: string, context?: string, metadata?: LogContext) {
    this.logger.info(this.buildEntries(message, context, metadata));
  }

  error(message: string, trace?: string, context?: string, metadata?: LogContext) {
    const entries = this.buildEntries(message, context, metadata);
    if (trace) {
      entries.stack = trace;
    }
    this.logger.error(entries);
  }

  warn(message: string, context?: string, metadata?: LogContext) {
    this.logger.warn(this.buildEntries(message, context, metadata));
  }

  debug(message: string, context?: string, metadata?: LogContext) {
    this.logger.debug(this.buildEntries(message, context, metadata));
  }

  verbose(message: string, context?: string, metadata?: LogContext) {
    this.logger.trace(this.buildEntries(message, context, metadata));
  }

  // Expose the underlying pino logger for child loggers
  getChild(context: string): PinoLogger {
    return this.logger.child({ context });
  }

  // Get raw pino logger for direct access
  getRawLogger(): PinoLogger {
    return this.logger;
  }

  protected buildEntries(
    message: string,
    context?: string,
    metadata?: LogContext,
  ): Record<string, unknown> {
    const entries: Record<string, unknown> = {
      msg: message,
    };

    if (context) {
      entries.context = context;
    }

    if (metadata) {
      // Extract known fields to top level
      if (metadata.correlationId) {
        entries.correlationId = metadata.correlationId;
      }
      if (metadata.messageId) {
        entries.messageId = metadata.messageId;
      }
      if (metadata.transactionId) {
        entries.transactionId = metadata.transactionId;
      }
      if (metadata.walletId) {
        entries.walletId = metadata.walletId;
      }
      if (metadata.providerId) {
        entries.providerId = metadata.providerId;
      }

      // Add any remaining fields
      const knownKeys = ['correlationId', 'messageId', 'transactionId', 'walletId', 'providerId'];
      for (const [key, value] of Object.entries(metadata)) {
        if (!knownKeys.includes(key)) {
          entries[key] = value;
        }
      }
    }

    return entries;
  }
}
