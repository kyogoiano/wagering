import { SQSClient, CreateQueueCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';

export interface SqsConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  queueName: string;
  dlqName: string;
  pollingIntervalMs: number;
  visibilityTimeoutSeconds: number;
  maxReceiveCount: number;
  consumerName: string;
}

export function createSqsClient(config: SqsConfig): SQSClient {
  return new SQSClient({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function ensureQueuesExist(
  client: SQSClient,
  config: SqsConfig,
  options: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<void> {
  const { maxRetries = 5, retryDelayMs = 2000 } = options;

  const attempt = async (): Promise<void> => {
    // Create DLQ first
    const dlqArn = await createQueueIfNotExists(client, config.dlqName);

    // Create main queue with redrive policy pointing to DLQ
    const redrivePolicy = JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: config.maxReceiveCount,
    });

    await createQueueIfNotExists(client, config.queueName, {
      'FifoQueue': 'true',
      'ContentBasedDeduplication': 'true',
      'VisibilityTimeout': String(config.visibilityTimeoutSeconds),
      'RedrivePolicy': redrivePolicy,
    });
  };

  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await attempt();
      return;
    } catch (err) {
      lastError = err as Error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (i + 1)));
      }
    }
  }

  throw lastError || new Error('Failed to create SQS queues after retries');
}

async function createQueueIfNotExists(
  client: SQSClient,
  queueName: string,
  attributes?: Record<string, string>,
): Promise<string> {
  try {
    const queueUrlResult = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    return queueUrlResult.QueueArn || await getQueueArn(client, queueUrlResult.QueueUrl!);
  } catch {
    // Queue doesn't exist, create it
    const attrs: Record<string, string> = { ...attributes };
    if (queueName.endsWith('.fifo') && !attrs['FifoQueue']) {
      attrs['FifoQueue'] = 'true';
      attrs['ContentBasedDeduplication'] = 'true';
    }

    const result = await client.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: attrs,
      }),
    );

    if (!result.QueueUrl || !result.QueueArn) {
      throw new Error(`Failed to create queue ${queueName}`);
    }

    return result.QueueArn;
  }
}

async function getQueueArn(client: SQSClient, queueUrl: string): Promise<string> {
  const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
  const result = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['QueueArn'],
    }),
  );
  return result.Attributes?.QueueArn || '';
}
