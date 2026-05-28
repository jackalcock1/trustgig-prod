require("dotenv").config({ path: "../.env" });
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      evmVersion: "london",
    },
  },
  networks: {
    ganache: {
      url: "http://127.0.0.1:7545",
      chainId: 1337,
      // No explicit accounts here - Hardhat will use the default eth_accounts
      // returned by Ganache, which are the 10 pre-funded accounts.
    },
  },
};