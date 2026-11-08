import { registerAs } from '@nestjs/config';

export default registerAs('sqs', () => ({
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  queueName: process.env.SQS_QUEUE_NAME || 'wager-transactions.fifo',
  dlqName: process.env.SQS_DLQ_NAME || 'wager-transactions-dlq.fifo',
  pollingIntervalMs: parseInt(process.env.SQS_POLLING_INTERVAL_MS || '1000', 10),
  visibilityTimeoutSeconds: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '30', 10),
  maxReceiveCount: parseInt(process.env.SQS_MAX_RECEIVE_COUNT || '3', 10),
  consumerName: process.env.SQS_CONSUMER_NAME || 'jungle-wager-consumer',
}));
