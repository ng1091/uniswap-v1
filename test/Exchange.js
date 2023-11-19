require("@nomicfoundation/hardhat-toolbox");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (value) => ethers.parseEther(value.toString());

const fromWei = (value) =>
  ethers.formatEther(
    typeof value === "string" ? value : value.toString()
  );

const getBalance = ethers.provider.getBalance.bind(ethers.provider);


describe("Exchange", () => {
  let owner;
  let user;
  let exchange;
  let token;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TKN", toWei(1000000));
    await token.waitForDeployment();

    const Exchange = await ethers.getContractFactory("Exchange");
    exchange = await Exchange.deploy(token.target);
    await exchange.waitForDeployment();
  });

  it("is deployed", async () => {
    expect(await token.waitForDeployment()).to.equal(token);
    expect(await exchange.waitForDeployment()).to.equal(exchange);
  });

  describe("addLiquidity", async () => {
    describe("empty reserves", async () => {
      it("adds liquidity", async () => {
        await token.approve(exchange.target, toWei(200));
        await exchange.addLiquidity(toWei(200), { value: toWei(100) });

        expect(await exchange.getReserve()).to.equal(toWei(200));
        expect(await getBalance(exchange.target)).to.equal(toWei(100));
      });

      it("mints LP tokens", async () => {
        await token.approve(exchange.target, toWei(200));
        await exchange.addLiquidity(toWei(200), { value: toWei(100) });

        expect(await exchange.balanceOf(owner.address)).to.eq(toWei(100));
        expect(await exchange.totalSupply()).to.eq(toWei(100));
      });

      it("allows zero amounts", async () => {
        await token.approve(exchange.target, 0);
        await exchange.addLiquidity(0, { value: 0 });

        expect(await getBalance(exchange.target)).to.equal(0);
        expect(await exchange.getReserve()).to.equal(0);
      });
    });

    describe("existing reserves", async () => {
      beforeEach(async () => {
        // 初始化添加流动性 200 Token， 100 ETH
        await token.approve(exchange.target, toWei(300));
        await exchange.addLiquidity(toWei(200), { value: toWei(100) });
      });

      it("check allowance", async () => {
        expect(await token.allowance(owner.address, exchange.target)).to.equal(toWei(100));
      });

      it("preserves exchange rate", async () => {
        // 再次添加流动性 200 Token, 50 ETH, 会按照之前的比例，只会添加 100 Token 和 50 ETH
        await exchange.addLiquidity(toWei(200), { value: toWei(50) });
        // 所以最终的流动性是 300 Token，150 ETH
        expect(await getBalance(exchange.target)).to.equal(toWei(150));
        expect(await exchange.getReserve()).to.equal(toWei(300));
      });

      it("fails when not enough tokens", async () => {
        // 如果 token 数量不足 eth 2倍，则会回滚
        await expect(
          exchange.addLiquidity(toWei(50), { value: toWei(50) })
        ).to.be.revertedWith("insufficient token amount");
      });

      it("mints LP tokens", async () => {
        await exchange.addLiquidity(toWei(200), { value: toWei(50) });

        expect(await exchange.balanceOf(owner.address)).to.eq(toWei(150));
        expect(await exchange.totalSupply()).to.eq(toWei(150));
      });
    });
  });

  describe("removeLiquidity", async () => {
    beforeEach(async () => {
      await token.approve(exchange.target, toWei(300));
      await exchange.addLiquidity(toWei(200), { value: toWei(100) });
      // 此时 owner 拥有 100 个 LP Token
    });

    it("removes some liquidity", async () => {
      const userEtherBalanceBefore = await getBalance(owner.address);
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      // remove  1/4 的 LP Token
      await exchange.removeLiquidity(toWei(25));

      // reserve 还剩 3/4
      expect(await exchange.getReserve()).to.equal(toWei(150));
      expect(await getBalance(exchange.target)).to.equal(toWei(75));

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      // 这个值通过跑一遍测试用例得到
      expect(
        fromWei(userEtherBalanceAfter - (userEtherBalanceBefore))
      ).to.equal("24.999936289097931772"); // 25 - gas fees

      expect(
        fromWei(userTokenBalanceAfter - (userTokenBalanceBefore))
      ).to.equal("50.0");
    });

    it("removes all liquidity", async () => {
      const userEtherBalanceBefore = await getBalance(owner.address);
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange.removeLiquidity(toWei(100));

      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await getBalance(exchange.target)).to.equal(toWei(0));

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      expect(
        fromWei(userEtherBalanceAfter - (userEtherBalanceBefore))
      ).to.equal("99.9999492383837452"); // 100 - gas fees

      expect(
        fromWei(userTokenBalanceAfter - (userTokenBalanceBefore))
      ).to.equal("200.0");
    });


    it("pays for provided liquidity", async () => {
      const userEtherBalanceBefore = await getBalance(owner.address);
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(18), { value: toWei(10) });

      await exchange.removeLiquidity(toWei(100));

      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await getBalance(exchange.target)).to.equal(toWei(0));
      expect(fromWei(await token.balanceOf(user.address))).to.equal(
        "18.132217877602982631"
      );

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      // Token/ETH 价格从 2 变成了  1.66
      expect(
        fromWei(userEtherBalanceAfter - (userEtherBalanceBefore))
      ).to.equal("109.999949364594841525"); // 110 - gas fees

      expect(
        fromWei(userTokenBalanceAfter - (userTokenBalanceBefore))
      ).to.equal("181.867782122397017369");
    });


    it("burns LP-tokens", async () => {
      // await expect(() =>
      //   exchange.removeLiquidity(toWei(25))
      // ).to.changeTokenBalance(exchange, owner, toWei(-25));

      await exchange.removeLiquidity(toWei(25));
      expect(await exchange.totalSupply()).to.equal(toWei(75));
    });

    it("doesn't allow invalid amount", async () => {
      await expect(exchange.removeLiquidity(toWei(100.1))).to.be.revertedWith(
        "ERC20: burn amount exceeds balance"
      );
    });

  });

  describe("getTokenAmount", async () => {
    it("returns correct token amount", async () => {
      await token.approve(exchange.target, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let tokensOut = await exchange.getTokenAmount(toWei(1));
      expect(fromWei(tokensOut)).to.equal("1.992013962079806432");

      tokensOut = await exchange.getTokenAmount(toWei(100));
      expect(fromWei(tokensOut)).to.equal("181.322178776029826316");

      tokensOut = await exchange.getTokenAmount(toWei(1000));
      expect(fromWei(tokensOut)).to.equal("998.497746619929894842");
    });
  });

  describe("getEthAmount", async () => {
    it("returns correct ether amount", async () => {
      await token.approve(exchange.target, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let ethOut = await exchange.getEthAmount(toWei(2));
      expect(fromWei(ethOut)).to.equal("0.996006981039903216");

      ethOut = await exchange.getEthAmount(toWei(100));
      expect(fromWei(ethOut)).to.equal("47.482973758155927037");

      ethOut = await exchange.getEthAmount(toWei(2000));
      expect(fromWei(ethOut)).to.equal("499.248873309964947421");
    });
  });

  describe("ethToTokenSwap", async () => {
    beforeEach(async () => {
      await token.approve(exchange.target, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("transfers at least min amount of tokens", async () => {
      const userBalanceBefore = await getBalance(user.address);

      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(1.99), { value: toWei(1) });

      const userBalanceAfter = await getBalance(user.address);
      expect(fromWei(userBalanceAfter - userBalanceBefore)).to.equal(
        "-1.000061018478667369"
      );

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("1.992013962079806432");

      const exchangeEthBalance = await getBalance(exchange.target);
      expect(fromWei(exchangeEthBalance)).to.equal("1001.0");

      const exchangeTokenBalance = await token.balanceOf(exchange.target);
      expect(fromWei(exchangeTokenBalance)).to.equal("1998.007986037920193568");
    });

    it("fails when output amount is less than min amount", async () => {
      await expect(
        exchange.connect(user).ethToTokenSwap(toWei(2), { value: toWei(1) })
      ).to.be.revertedWith("insufficient output amount");
    });

    it("allows zero swaps", async () => {
      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(0), { value: toWei(0) });

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("0.0");

      const exchangeEthBalance = await getBalance(exchange.target);
      expect(fromWei(exchangeEthBalance)).to.equal("1000.0");

      const exchangeTokenBalance = await token.balanceOf(exchange.target);
      expect(fromWei(exchangeTokenBalance)).to.equal("2000.0");
    });
  });

  describe("tokenToEthSwap", async () => {
    beforeEach(async () => {
      await token.transfer(user.address, toWei(2));
      await token.connect(user).approve(exchange.target, toWei(2));

      await token.approve(exchange.target, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("transfers at least min amount of tokens", async () => {
      const userBalanceBefore = await getBalance(user.address);

      await exchange.connect(user).tokenToEthSwap(toWei(2), toWei(0.9));

      const userBalanceAfter = await getBalance(user.address);
      expect(fromWei(userBalanceAfter - userBalanceBefore)).to.equal(
        "0.995957659338607917"
      );

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("0.0");

      const exchangeEthBalance = await getBalance(exchange.target);
      expect(fromWei(exchangeEthBalance)).to.equal("999.003993018960096784");

      const exchangeTokenBalance = await token.balanceOf(exchange.target);
      expect(fromWei(exchangeTokenBalance)).to.equal("2002.0");
    });

    it("fails when output amount is less than min amount", async () => {
      await expect(
        exchange.connect(user).tokenToEthSwap(toWei(2), toWei(1.0))
      ).to.be.revertedWith("insufficient output amount");
    });

    it("allows zero swaps", async () => {
      await exchange.connect(user).tokenToEthSwap(toWei(0), toWei(0));

      const userBalance = await getBalance(user.address);
      expect(fromWei(userBalance)).to.equal("9989.995549179323030733");

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("2.0");

      const exchangeEthBalance = await getBalance(exchange.target);
      expect(fromWei(exchangeEthBalance)).to.equal("1000.0");

      const exchangeTokenBalance = await token.balanceOf(exchange.target);
      expect(fromWei(exchangeTokenBalance)).to.equal("2000.0");
    });
  });

});