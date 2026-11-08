import { describe, expect, it } from 'bun:test';
import { PinoLoggerService } from './pino-logger.service';
import pino from 'pino';

describe('PinoLoggerService', () => {
  let capturedLogs: pino.LogDescriptor[];

  function createLoggerWithCapture(): { service: PinoLoggerService; logs: pino.LogDescriptor[] } {
    capturedLogs = [];
    const stream = { write: (chunk: string) => {
      try {
        const parsed = JSON.parse(chunk.trim());
        capturedLogs.push(parsed);
      } catch {
        // ignore non-JSON
      }
    }};
    const service = new PinoLoggerService({
      level: 'debug',
      base: undefined,
      transport: undefined,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });
    // Override the internal logger with a stream logger for testing
    (service as any).logger = pino(
      {
        level: 'debug',
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level: (label: string) => ({ level: label.toUpperCase() }),
        },
      },
      stream as any,
    );
    return { service, logs: capturedLogs };
  }

  it('should log info messages with correct level', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test message', 'TestContext');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].msg).toBe('test message');
    expect(logs[0].context).toBe('TestContext');
  });

  it('should log error messages with stack trace', () => {
    const { service, logs } = createLoggerWithCapture();
    service.error('error occurred', 'Error stack trace', 'ErrorContext');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('ERROR');
    expect(logs[0].msg).toBe('error occurred');
    expect(logs[0].stack).toBe('Error stack trace');
  });

  it('should log warn messages', () => {
    const { service, logs } = createLoggerWithCapture();
    service.warn('warning message', 'WarnContext');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('WARN');
    expect(logs[0].msg).toBe('warning message');
  });

  it('should log debug messages', () => {
    const { service, logs } = createLoggerWithCapture();
    service.debug('debug message', 'DebugContext');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('DEBUG');
    expect(logs[0].msg).toBe('debug message');
  });

  it('should include correlationId in log entries', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test', 'Context', { correlationId: 'corr-123' });
    expect(logs[0].correlationId).toBe('corr-123');
  });

  it('should include transactionId in log entries', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test', 'Context', { transactionId: 'txn-456' });
    expect(logs[0].transactionId).toBe('txn-456');
  });

  it('should include walletId in log entries', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test', 'Context', { walletId: 'wallet-789' });
    expect(logs[0].walletId).toBe('wallet-789');
  });

  it('should include providerId in log entries', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test', 'Context', { providerId: 'provider-a' });
    expect(logs[0].providerId).toBe('provider-a');
  });

  it('should include messageId in log entries', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test', 'Context', { messageId: 'msg-abc' });
    expect(logs[0].messageId).toBe('msg-abc');
  });

  it('should include all standard context fields', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('transaction processed', 'WageringController', {
      correlationId: 'corr-123',
      transactionId: 'txn-456',
      walletId: 'wallet-789',
      providerId: 'provider-a',
    });
    expect(logs[0].correlationId).toBe('corr-123');
    expect(logs[0].transactionId).toBe('txn-456');
    expect(logs[0].walletId).toBe('wallet-789');
    expect(logs[0].providerId).toBe('provider-a');
  });

  it('should include custom metadata fields', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test', 'Context', { customField: 'customValue', anotherField: 42 });
    expect(logs[0].customField).toBe('customValue');
    expect(logs[0].anotherField).toBe(42);
  });

  it('should include ISO timestamp', () => {
    const { service, logs } = createLoggerWithCapture();
    service.log('test');
    expect(logs[0].time).toBeDefined();
    const date = new Date(logs[0].time);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });

  it('should get child logger with context', () => {
    const { service } = createLoggerWithCapture();
    const child = service.getChild('MyContext');
    expect(child).toBeDefined();
  });

  it('should get raw logger', () => {
    const { service } = createLoggerWithCapture();
    const raw = service.getRawLogger();
    expect(raw).toBeDefined();
  });
});
