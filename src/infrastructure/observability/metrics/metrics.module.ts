import { Module, Global, DynamicModule } from '@nestjs/common';
import { PrometheusMetricsService } from './prometheus-metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({})
export class MetricsModule {
  static forRoot(): DynamicModule {
    return {
      module: MetricsModule,
      controllers: [MetricsController],
      providers: [PrometheusMetricsService],
      exports: [PrometheusMetricsService],
    };
  }
}
