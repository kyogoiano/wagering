export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidAmountError extends DomainError {
  constructor(amount: string) {
    super(`Invalid money amount: "${amount}"`);
  }
}

export class InvalidCurrencyError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(balance: string, requested: string) {
    super(`Insufficient balance: ${balance}, requested: ${requested}`);
  }
}

export class InvalidTransactionStateError extends DomainError {
  constructor(currentState: string, action: string) {
    super(`Invalid transition: cannot ${action} from state ${currentState}`);
  }
}

export class ReferenceNotFoundError extends DomainError {
  constructor(referenceId: string) {
    super(`Reference transaction not found: ${referenceId}`);
  }
}

export class WalletNotFoundError extends DomainError {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`);
  }
}

export class WalletAlreadyExistsError extends DomainError {
  constructor(playerId: string, currency: string) {
    super(`Wallet already exists for player ${playerId} in currency ${currency}`);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(key: string) {
    super(`Idempotency conflict for key: ${key}`);
  }
}
