

const toWei = (value) => ethers.parseEther(value.toString());


async function main() {
  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy("Token", "TKN", toWei(1000000));
  console.log("Contract Deployed to Address:", token.target);

  const Exchange = await ethers.getContractFactory("Exchange");
  const exchange = await Exchange.deploy(token.target);
  console.log("Contract Deployed to Address:", exchange.target);

  const Factory = await ethers.getContractFactory("Factory");
  const factory = await Factory.deploy();
  console.log("Contract Deployed to Address:", factory.target);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });