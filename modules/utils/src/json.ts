import { BigNumber } from "ethers";
import { isBigNumberJson, isBigNumber } from "./bigNumbers";
import { abbreviate } from "./hexStrings";

export const bigNumberifyJson = (json: any): any =>
  typeof json === "string"
    ? json
    : JSON.parse(JSON.stringify(json), (key: string, value: any): any =>
        value && isBigNumberJson(value) ? BigNumber.from(value) : value,
      );

export const deBigNumberifyJson = (json: any): any =>
  JSON.parse(JSON.stringify(json), (key: string, value: any) =>
    value && isBigNumber(value) ? value.toHexString() : value,
  );

// Give abrv = true to abbreviate hex strings and addresss to look like "0x6FEC..kuQk"
export const stringify = (value: any, abrv: boolean = false): string =>
  JSON.stringify(
    value,
    (key: string, value: any): any =>
      value && isBigNumberJson(value)
        ? BigNumber.from(value).toString()
        : abrv && value && typeof value === "string" && value.startsWith("indra")
        ? abbreviate(value, 5)
        : abrv && value && typeof value === "string" && value.startsWith("0x") && value.length > 12
        ? abbreviate(value)
        : value,
    2,
  );

const nullify = (key: string, value: any) => (typeof value === "undefined" ? null : value);

export const safeJsonStringify = (value: any): string => {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, nullify);
  } catch (e) {
    console.log(`Failed to safeJsonstringify value ${value}: ${e.message}`);
    return value;
  }
};

export const safeJsonParse = (value: any): any => {
  try {
    return typeof value === "string" ? JSON.parse(value, nullify) : value;
  } catch (e) {
    console.log(`Failed to safeJsonParse value ${value}: ${e.message}`);
    return value;
  }
};
