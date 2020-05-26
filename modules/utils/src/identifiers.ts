import { Address, AssetId, PublicKey, PublicIdentifier } from "@connext/types";
import bs58check from "bs58check";
import { getAddress } from "ethers/utils";
import {
  hexToBuffer,
  bufferToHex,
  compress,
  decompress,
} from "eccrypto-js";

import { getAddressError } from "./hexStrings";
import { getAddressFromPublicKey } from "./crypto";

export const INDRA_PUB_ID_PREFIX = "indra";

////////////////////////////////////////
// Conversions

export const getPublicIdentifierFromPublicKey = (publicKey: PublicKey): PublicIdentifier =>
  INDRA_PUB_ID_PREFIX + bs58check.encode(compress(hexToBuffer(publicKey)));

const identCache: {[k:string]: string} = {};

export const getPublicKeyFromPublicIdentifier = (publicIdentifier: PublicIdentifier): string => {
  if (identCache[publicIdentifier]) {
    return identCache[publicIdentifier];
  }

  const val = `0x${bufferToHex(decompress(bs58check.decode(
    publicIdentifier.replace(INDRA_PUB_ID_PREFIX, ""),
  )))}`;
  identCache[publicIdentifier] = val;
  return val;
};

const addrCache: {[k:string]: string} = {};

export const getSignerAddressFromPublicIdentifier = (publicIdentifier: PublicIdentifier): Address => {
  if (addrCache[publicIdentifier]) {
    return addrCache[publicIdentifier];
  }

  const val = getAddressFromPublicKey(getPublicKeyFromPublicIdentifier(publicIdentifier));
  addrCache[publicIdentifier] = val;
  console.log('cached signer address', publicIdentifier, val);
  return val;
}

// makes sure all addresses are normalized
export const getAddressFromAssetId = (assetId: AssetId): Address => getAddress(assetId);

////////////////////////////////////////
// Validators

export const getPublicIdentifierError = (value: any): string | undefined => {
  try {
    if (typeof value !== "string") {
      return `Invalid public identifier. Expected a string, got ${typeof value}`;
    } else if (!value.startsWith(INDRA_PUB_ID_PREFIX)) {
      return `Invalid public identifier. Expected ${value} to start with ${INDRA_PUB_ID_PREFIX}`;
    }
    const addressError = getAddressError(getSignerAddressFromPublicIdentifier(value));
    return addressError
      ? `Invalid public identifier. Got errors recovering address from ${value}: ${addressError}`
      : undefined;
  } catch (e) {
    return e.message;
  }
};
export const isValidPublicIdentifier = (value: any): boolean => !getPublicIdentifierError(value);
