import { Signer } from "ethers";
import { Address, PublicKey, PublicIdentifier } from "./basic";
import { Receipt } from "./contracts";

export interface IChannelSigner extends Signer {
  address: Address;
  decrypt(message: string): Promise<string>;
  encrypt(message: string, publicKey: string): Promise<string>;
  signMessage(message: string): Promise<string>;
  signReceiptMessage(receipt: Receipt, verifyingContract: Address): Promise<string>;
  publicKey: PublicKey;
  publicIdentifier: PublicIdentifier;
}
