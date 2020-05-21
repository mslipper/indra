import { BigNumber } from "ethers";

import {
  isBigNumber,
  isBigNumberJson,
  getBigNumberError,
  getBigNumberishError,
} from "./bigNumbers";

const TEST_BN = BigNumber.from(1);
const TEST_BN_JSON_1 = { _hex: "0x01" };
const TEST_BN_JSON_2 = { _hex: "0x01", _isBigNumber: true };
const TEST_BN_INVALID = { amount: 1 };

describe("BigNumbers", () => {
  describe("isBigNumber", () => {
    it("return true for BigNumber object", () => {
      expect(isBigNumber(TEST_BN)).toEqual(true);
    });
    it("return false for BigNumber json without _isBigNumber", () => {
      expect(isBigNumber(TEST_BN_JSON_1)).toEqual(false);
    });
    it("return false for BigNumber json with _isBigNumber", () => {
      expect(isBigNumber(TEST_BN_JSON_2)).toEqual(false);
    });
  });
  describe("isBigNumberJson", () => {
    it("return false for BigNumber object", () => {
      expect(isBigNumberJson(TEST_BN)).toEqual(false);
    });
    it("return true for BigNumber json without _isBigNumber", () => {
      expect(isBigNumberJson(TEST_BN_JSON_1)).toEqual(true);
    });
    it("return true for BigNumber json with _isBigNumber", () => {
      expect(isBigNumberJson(TEST_BN_JSON_2)).toEqual(true);
    });
  });
  describe("getBigNumberError", () => {
    it("return undefined for valid BigNumber", () => {
      expect(getBigNumberError(TEST_BN)).toEqual(undefined);
    });
    it("return error message for invalid BigNumber", () => {
      expect(getBigNumberError(TEST_BN_INVALID)).toEqual(
        `Value "${TEST_BN_INVALID}" is not a BigNumber`,
      );
    });
  });
  describe("getBigNumberishError", () => {
    it("return", () => {
      expect(getBigNumberishError(TEST_BN)).toEqual(undefined);
    });
    it("return error message for invalid BigNumberish", () => {
      expect(getBigNumberishError(TEST_BN_INVALID)).toEqual(
        `Value "${TEST_BN_INVALID}" is not BigNumberish: invalid BigNumber value (argument=\"value\", value={\"amount\":1}, code=INVALID_ARGUMENT, version=bignumber/5.0.0-beta.139)`,
      );
    });
  });
});
