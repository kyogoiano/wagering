import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  @HttpCode(HttpStatus.OK)
  getLive(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async getReady(): Promise<{ status: string; dependencies: Record<string, string> }> {
    // Placeholder — will be wired to real health indicators once MikroORM/SQS are configured
    return {
      status: 'ok',
      dependencies: {
        postgresql: 'ok',
        sqs: 'ok',
      },
    };
  }
}
