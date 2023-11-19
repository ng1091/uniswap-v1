// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IFactory {
    function getExchange(address _tokenAddress) external view returns (address);
}

interface IExchange {
    function ethToTokenSwapWithRecipient(uint256 minTokens, address _recipient) external payable;
}

contract Exchange is ERC20 {
    address public tokenAddress;
    address public factoryAddress;

    constructor(address _token) ERC20("Uniswap Study", "UNIS") {
        require(_token != address(0), "invalid token address");

        tokenAddress = _token;
        factoryAddress = msg.sender;
    }

    // 获取 token 余额
    function getReserve() public view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    // 只有首次添加流动性时可以按任意比例添加，之后必须按照相同的比例添加
    // 在 uniswap v1，根据 eth 的数量 mint LP Token
    function addLiquidity(uint256 _tokenAmount) public payable returns (uint256) {
        if (getReserve() == 0) { // 首次添加
            IERC20 token = IERC20(tokenAddress);
            token.transferFrom(msg.sender, address(this), _tokenAmount);
            // mint LP-Tokens
            uint256 liquidity = address(this).balance;
            _mint(msg.sender, liquidity);
            return liquidity;
        } else { // 非首次添加
            // 由于调用者发送的 ETH 已经计入到 address(this).balance， 所以需要减掉本次发送的数量 msg.value， 才能得到调用之前的 eth 资产数量
            uint256 ethReserve = address(this).balance - msg.value;
            uint256 tokenReserve = getReserve();
            // 以 eth 数量，来计算需要存入多少 token 数量
            uint256 tokenAmount = (msg.value * tokenReserve) / ethReserve; // 根据 ethAmount / tokenAmount = ethReserve / tokenReserve 
            require(_tokenAmount > tokenAmount, "insufficient token amount");

            IERC20 token = IERC20(tokenAddress);
            // 实际 transfer 数量是根据公式计算得到的，不能是入参 _tokenAmount
            token.transferFrom(msg.sender, address(this), tokenAmount);

            // 根据本次存入的 eth 数量所占比例，mint LP-Tokens
            uint256 liquidity = (totalSupply() * msg.value) / ethReserve;
            _mint(msg.sender, liquidity);
            return liquidity;
        }
    }

    // 按照 LP Token 的比例提取 eth 和 token，返回两者的数量
    function removeLiquidity(uint256 _amount) public returns (uint256, uint256) {
        require(_amount > 0, "invalid amount");

        uint256 ethAmount = address(this).balance * _amount / totalSupply();
        uint256 tokenAmount = getReserve() * _amount / totalSupply();
        
        _burn(msg.sender, _amount);
        payable(msg.sender).transfer(ethAmount);
        IERC20(tokenAddress).transfer(msg.sender, tokenAmount);

        return (ethAmount, tokenAmount);
    }

    // 获取交易输出，根据公式 (x+△x)(y-△y) = x*y, 其中 x、y 是两个资产总量 (reserve)，△x 是输入，△y 是输出，均为正数
    // 得到输出 △y = (y * △x) / (x + △x)
    function getAmount(
        uint256 inputAmount,
        uint256 inputReserve,
        uint256 outputReserve
    ) private pure returns (uint256) {
        require(inputReserve > 0 && outputReserve > 0,"invalid reserves");

        // fee = 0.3%,  给分子分母同时乘以 1000
        uint256 inputAmountWithFee = inputAmount * 997;

        return (outputReserve * inputAmountWithFee) / (inputReserve * 1000 + inputAmountWithFee);
    }

    // 将 getAmount 封装得到两个 wrapper 函数：getTokenAmount 和 getEthAmount
    // 计算输出数量: eth -> token
    function getTokenAmount(uint256 ethSold) public view returns (uint256) {
        require(ethSold > 0, "ethSold cannot be 0");

        uint256 tokenReserve = getReserve();

        return getAmount(ethSold, address(this).balance, tokenReserve);
    }

    // 计算输出数量: token -> eth
    function getEthAmount(uint256 tokenSold) public view returns (uint256) {
        require(tokenSold > 0, "tokenSold cannot be 0");

        uint256 tokenReserve = getReserve();

        return getAmount(tokenSold, tokenReserve, address(this).balance);
    }

    // swap: eth -> token
    // 先利用 getAmount 计算输出的 token 数量，检查大于 minTokens，然后调用 token 的 transfer 方法
    function ethToTokenSwap(uint256 minTokens) public payable {
        uint256 tokenReserve = getReserve();
        uint256 tokensBought = getAmount(
            msg.value, 
            address(this).balance - msg.value, 
            tokenReserve
        );

        require(tokensBought >= minTokens, "insufficient output amount");

        IERC20(tokenAddress).transfer(msg.sender, tokensBought);
    }

    // swap: eth -> token
    // 可以指定接收 token 的人，用于 token -> token
    function ethToTokenSwapWithRecipient(uint256 minTokens, address _recipient) external payable {
        uint256 tokenReserve = getReserve();
        uint256 tokensBought = getAmount(
            msg.value, 
            address(this).balance - msg.value, 
            tokenReserve
        );

        require(tokensBought > minTokens, "insufficent output amount");

        IERC20(tokenAddress).transfer(_recipient, tokensBought);
    }

    // swap: token -> eth
    // 先利用 getAmount 计算输出的 eth 数量，检查大于 minEth，然后调用 token 的 transferFrom 转入 token，再调用原生 transfer 方法转出 eth
    function tokenToEthSwap(uint256 tokenSold, uint256 minEth) public {
        uint256 tokenReserve = getReserve();
        uint256 ethBought = getAmount(
            tokenSold, 
            tokenReserve, 
            address(this).balance
        );

        require(ethBought >= minEth, "insufficient output amount");

        IERC20(tokenAddress).transferFrom(msg.sender, address(this), tokenSold);
        payable(msg.sender).transfer(ethBought);
    }

    // swap: token -> token
    // 先 token-> eth, 再 eth -> token
    function tokenToTokenSwap(uint256 _tokenSold, uint256 _minTokensBought, address _tokenAddress) public {
        address exchangeAddress = IFactory(factoryAddress).getExchange(_tokenAddress);
        // 检查 _tokenAddress 是否存在 exchange
        require(exchangeAddress != address(0) && exchangeAddress != address(this), "invalid exchange address");

        // 复用 tokenToEthSwap 的部分代码
        uint256 tokenReserve = getReserve();
        uint256 ethBought = getAmount(
            _tokenSold, 
            tokenReserve, 
            address(this).balance
        );

        IERC20(tokenAddress).transferFrom(msg.sender, address(this), _tokenSold);

        // 复用 ethToTokenSwap 的部分代码
        IExchange(exchangeAddress).ethToTokenSwapWithRecipient{value: ethBought}(_minTokensBought, msg.sender);
    }

    function getPrice(uint256 inputReserve, uint256 outputReserve) public pure returns (uint256) {
        require(inputReserve > 0 && outputReserve > 0, "invalid reserves");

        // * 1000 是为了防止结果是小数被四舍五入变成 0
        return (inputReserve * 1000) / outputReserve;
    }

}