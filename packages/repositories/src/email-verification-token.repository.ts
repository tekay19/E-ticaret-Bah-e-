import { SingleUseTokenRepository } from "./single-use-token.repository.js";

export class EmailVerificationTokenRepository extends SingleUseTokenRepository {
  protected tableName = "email_verification_tokens";
}
