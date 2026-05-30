import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "@bahce-shop/shared";

function hasHttpStatus(error: unknown): error is { statusCode: number; code?: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function uniqueViolationMessage(constraint?: string) {
  if (constraint?.includes("products_sku")) return "Bu SKU zaten kullanılıyor. Farklı bir stok kodu gir.";
  if (constraint?.includes("products_slug")) return "Bu ürün adıyla daha önce ürün oluşturulmuş. Ürün adını biraz değiştir.";
  if (constraint?.includes("product_variants_sku")) return "Bu satış satırı stok kodu zaten kullanılıyor. Farklı bir kod gir.";
  if (constraint?.includes("categories_slug")) return "Bu kategori adı zaten var. Farklı bir ad gir.";
  if (constraint?.includes("brands_slug")) return "Bu marka adı zaten var. Farklı bir ad gir.";
  return "Bu kayıt daha önce oluşturulmuş. Bilgileri değiştirip tekrar dene.";
}

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      request.log.warn({ err: error }, "domain error");
      reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (isUniqueViolation(error)) {
      request.log.warn({ err: error }, "unique violation");
      reply.status(409).send({
        error: "conflict",
        message: uniqueViolationMessage(error.constraint),
      });
      return;
    }

    if (hasHttpStatus(error) && error.statusCode >= 400 && error.statusCode < 500) {
      request.log.warn({ err: error }, "request error");
      reply.status(error.statusCode).send({
        error: error.code ?? "request_error",
        message: error.message,
      });
      return;
    }

    request.log.error({ err: error }, "unhandled error");
    reply.status(500).send({
      error: "internal_server_error",
      message: "Beklenmeyen bir hata olustu.",
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
});
