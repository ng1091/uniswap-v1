// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./Exchange.sol";

contract Factory {
    mapping(address => address) public tokenToExchange;

    function createExchange(address _tokenAddress) public returns (address) {
        require(_tokenAddress != address(0), "invalid token address");
        require(tokenToExchange[_tokenAddress] == address(0), "exchange already exists");

        // new Exchange 就会在链上部署一个新合约
        Exchange exchange = new Exchange(_tokenAddress);
        tokenToExchange[_tokenAddress] = address(exchange);

        return address(exchange);
    }

    function getExchange(address _tokenAddress) public view returns (address) {
        return tokenToExchange[_tokenAddress];
    }

}