import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

let correlationIdCounter = 0;

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      `corr-${Date.now()}-${++correlationIdCounter}`;

    (request as Record<string, unknown>)['correlationId'] = correlationId;
    response.setHeader('X-Correlation-Id', correlationId);

    return next.handle().pipe(
      tap(() => {
        // Correlation ID available in request for logging
      }),
    );
  }
}
