require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

const { API_URL, USER_1, USER_2 } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    sepolia: {
      url: API_URL,
      accounts: [`0x${USER_1}`, `0x${USER_2}`]
    }
  },
};
