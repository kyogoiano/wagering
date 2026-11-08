import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  DomainError,
  InsufficientBalanceError,
  InvalidCurrencyError,
  InvalidAmountError,
  WalletNotFoundError,
  WalletAlreadyExistsError,
  IdempotencyConflictError,
  InvalidTransactionStateError,
  ReferenceNotFoundError,
} from '@domain/errors/domain.error';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string;
  error: string;
  correlationId?: string;
}

@Catch(DomainError)
export class BusinessExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BusinessExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, errorLabel } = this.mapException(exception);

    const errorResponse: ErrorResponse = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
      error: errorLabel,
    };

    this.logger.error(
      `Domain error: ${exception.name} - ${exception.message}`,
      exception.stack,
    );

    response.status(statusCode).json(errorResponse);
  }

  private mapException(exception: DomainError): {
    statusCode: HttpStatus;
    errorLabel: string;
  } {
    switch (exception.constructor) {
      case InsufficientBalanceError:
        return { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, errorLabel: 'Insufficient Balance' };
      case InvalidCurrencyError:
        return { statusCode: HttpStatus.BAD_REQUEST, errorLabel: 'Invalid Currency' };
      case InvalidAmountError:
        return { statusCode: HttpStatus.BAD_REQUEST, errorLabel: 'Invalid Amount' };
      case WalletNotFoundError:
        return { statusCode: HttpStatus.NOT_FOUND, errorLabel: 'Wallet Not Found' };
      case WalletAlreadyExistsError:
        return { statusCode: HttpStatus.CONFLICT, errorLabel: 'Wallet Already Exists' };
      case IdempotencyConflictError:
        return { statusCode: HttpStatus.CONFLICT, errorLabel: 'Idempotency Conflict' };
      case InvalidTransactionStateError:
        return { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, errorLabel: 'Invalid Transaction State' };
      case ReferenceNotFoundError:
        return { statusCode: HttpStatus.NOT_FOUND, errorLabel: 'Reference Not Found' };
      default:
        return { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, errorLabel: 'Business Error' };
    }
  }
}
