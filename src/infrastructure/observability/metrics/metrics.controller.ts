import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusMetricsService } from './prometheus-metrics.service';
import { Public } from '@auth/decorators/public.decorator';

@Controller('metrics')
@Public()
export class MetricsController {
  constructor(private readonly metricsService: PrometheusMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetricsAsString();
  }
}
