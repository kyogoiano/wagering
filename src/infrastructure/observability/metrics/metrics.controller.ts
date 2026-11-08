import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusMetricsService } from './prometheus-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: PrometheusMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetricsAsString();
  }
}
