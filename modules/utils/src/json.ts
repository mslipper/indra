import {bigNumberify} from 'ethers/utils';

import {isBN, toBN} from './bigNumbers';
import {abbreviate} from './hexStrings';

const MAX_DEPTH = 8;

export const bigNumberifyJson = (json: any): any => {
  return bigNumberifyTree(json);
};

function bigNumberifyTree (json: any, depth: number = 0) {
  if (depth > MAX_DEPTH) {
    return json;
  }
  if (Array.isArray(json)) {
    const out = [];
    for (let i = 0; i < json.length; i++) {
      out.push(bigNumberifyTree(json[i], depth + 1));
    }
    return out;
  }
  if (json === null || typeof json !== 'object') {
    return json;
  }
  if (json._hex) {
    return toBN(json._hex);
  }

  const out = {};
  for (const key of Object.keys(json)) {
    out[key] = bigNumberifyTree(json[key], depth + 1);
  }
  return out;
}

export const deBigNumberifyJson = (json: any): any => {
  return deBigNumberifyTree(json);
};

function deBigNumberifyTree (json: any, depth: number = 0) {
  if (depth > MAX_DEPTH) {
    return json;
  }
  if (isBN(json)) {
    return {_hex: json.toHexString()};
  }
  if (Array.isArray(json)) {
    const out = [];
    for (let i = 0; i < json.length; i++) {
      out.push(deBigNumberifyTree(json[i], depth + 1));
    }
    return out;
  }
  if (json === null || typeof json !== 'object') {
    return json;
  }

  const out = {};
  for (const key of Object.keys(json)) {
    out[key] = deBigNumberifyTree(json[key], depth + 1);
  }
  return out;
}

// Give abrv = true to abbreviate hex strings and addresss to look like "0x6FEC..kuQk"
export const stringify = (value: any, abrv: boolean = false): string =>
  JSON.stringify(
    value,
    (key: string, value: any): any =>
      value && value._hex
        ? bigNumberify(value).toString()
        : abrv && value && typeof value === "string" && value.startsWith("indra")
        ? abbreviate(value, 5)
        : abrv && value && typeof value === "string" && value.startsWith("0x") && value.length > 12
        ? abbreviate(value)
        : value,
    2,
  );

const nullify = (key: string, value: any) => typeof value === "undefined" ? null : value;

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

