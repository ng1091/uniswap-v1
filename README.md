# Uniswap V1

### Solidity 实现的 Uniswap V1

最近在学习 uniswap，最初版本来自 [zuniswap](https://github.com/Jeiwan/zuniswap)，由于 hardhat、ethers.js 版本变化，原代码已无法运行。所以本仓库做了兼容，并补充了中文注释。


### 部署
本地新建 .env 文件
```
API_URL = <YOUR_API_URL>
API_KEY = <YOUR_API_KEY>
USER_1 = <PRIVATE_KEY1>
USER_2 = <PRIVATE_KEY2>
```

运行测试用例
```
npx hardhat test
```

部署到测试网
```
npx hardhat run deployments/deploy.js --network sepolia
```