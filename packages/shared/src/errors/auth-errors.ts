import { DomainError } from "./domain-error.js";

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("invalid_credentials", 401, "Email veya sifre hatali.");
  }
}

export class AccountLockedError extends DomainError {
  constructor(lockedUntil: string) {
    super("account_locked", 423, `Hesap gecici olarak kilitlendi: ${lockedUntil}`);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Bu islem icin giris yapmaniz gerekiyor.") {
    super("unauthorized", 401, message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Bu islem icin yetkiniz bulunmuyor.") {
    super("forbidden", 403, message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, code = "conflict") {
    super(code, 409, message);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("validation_error", 400, message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("not_found", 404, message);
  }
}

export class InsufficientStockError extends DomainError {
  constructor(message = "Yeterli stok bulunmuyor.") {
    super("insufficient_stock", 409, message);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super("invalid_state_transition", 400, `${from} durumundan ${to} durumuna gecilemez.`);
  }
}
