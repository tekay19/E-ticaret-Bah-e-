import { createHash } from "node:crypto";
import type { ShipmentEvent } from "./types.js";

export function makeTrackingNumber(prefix: string, orderNumber: string) {
  const digest = createHash("sha1").update(orderNumber).digest("hex").slice(0, 10).toUpperCase();
  return `${prefix}${digest}`;
}

export function makeLabelBuffer(carrierName: string, trackingNumber: string) {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 160] /Contents 4 0 R >> endobj",
    `4 0 obj << /Length 78 >> stream\nBT /F1 18 Tf 24 100 Td (${carrierName}) Tj 0 -28 Td (${trackingNumber}) Tj ET\nendstream endobj`,
    "xref",
    "0 5",
    "0000000000 65535 f ",
    "trailer << /Root 1 0 R /Size 5 >>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf);
}

export function eventDedupeKey(carrierCode: string, event: ShipmentEvent) {
  return `${carrierCode}:${event.trackingNumber}:${event.eventType}:${event.occurredAt}`;
}
