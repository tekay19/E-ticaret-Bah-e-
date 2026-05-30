import { SingleUseTokenRepository } from "./single-use-token.repository.js";

export class PasswordResetTokenRepository extends SingleUseTokenRepository {
  protected tableName = "password_reset_tokens";
}
