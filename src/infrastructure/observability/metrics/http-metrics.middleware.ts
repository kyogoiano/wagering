import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrometheusMetricsService } from '@infrastructure/observability/metrics/prometheus-metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: PrometheusMetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const method = req.method as Parameters<typeof this.metricsService.incrementHttpRequest>[0];
    const endpoint = this.normalizePath(req.route?.path ?? req.path);

    const finish = this.metricsService.startProcessingTimer('http_request');
    res.on('finish', () => {
      const status = String(res.statusCode);
      this.metricsService.incrementHttpRequest(method, endpoint, status);
      finish();
    });

    next();
  }

  protected normalizePath(path: string): string {
    // Convert /wallets/:id to /wallets/{id}
    return path.replace(/:(\w+)/g, '{$1}');
  }
}
