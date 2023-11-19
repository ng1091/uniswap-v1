
const toWei = (value) => ethers.parseEther(value.toString());

const fromWei = (value) =>
  ethers.formatEther(
    typeof value === "string" ? value : value.toString()
  );

async function main() {
    [owner, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.attach("0x1a18CC8FA17126E650a24dF30284E10cc37761de");

    const Exchange = await ethers.getContractFactory("Exchange");
    const exchange = await Exchange.attach("0x40eA8aeCF0071a542AC69f62586E3c84466cD3f5");

    await token.transfer(user.address, toWei(200));

    // adds liquidity
    await token.approve(exchange.target, toWei(200));
    await exchange.addLiquidity(toWei(200), { value: toWei(0.1) });

    const reserve = await exchange.getReserve();
    console.log("reserve:" + fromWei(reserve));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });