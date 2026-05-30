import type { CarrierCode } from "@bahce-shop/repositories";
import { ArasCarrier } from "./aras.client.js";
import { MngCarrier } from "./mng.client.js";
import type { ICarrier } from "./types.js";

const carriers: Record<CarrierCode, ICarrier> = {
  aras: new ArasCarrier(),
  mng: new MngCarrier(),
  yurtici: new ArasCarrier(),
};

export function getCarrier(code: CarrierCode) {
  return carriers[code];
}

export * from "./aras.client.js";
export * from "./mng.client.js";
export * from "./types.js";
