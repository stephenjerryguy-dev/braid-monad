import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.connect();
const [owner, lender, borrower, staker, player] = await ethers.getSigners();

const staking = await ethers.deployContract("BraidStaking");
const market = await ethers.deployContract("BraidMarket", [await staking.getAddress()]);
const nft = await ethers.deployContract("MockERC721");

await staking.connect(staker).stake({ value: ethers.parseEther("2") });
await nft.mint(borrower.address);
await nft.connect(borrower).approve(await market.getAddress(), 1n);

const principal = ethers.parseEther("1");
const repayment = ethers.parseEther("1.1");
const latestBlock = await ethers.provider.getBlock("latest");
assert(latestBlock);
await market.connect(lender).createOffer(
  0,
  await nft.getAddress(),
  1n,
  repayment,
  86_400,
  latestBlock.timestamp + 3_600,
  42n,
  { value: principal },
);
await market.connect(borrower).acceptOffer(1n);
assert.equal(await nft.ownerOf(1n), await market.getAddress());
await market.connect(borrower).repay(1n, { value: repayment });
assert.equal(await nft.ownerOf(1n), borrower.address);
assert.equal(await staking.pendingRewards(staker.address), ethers.parseEther("0.01"));
assert.equal((await market.offers(1n)).agentId, 42n);

const entropy = await ethers.deployContract("MockEntropy");
const arena = await ethers.deployContract("BraidArena", [await entropy.getAddress(), owner.address]);
await arena.connect(player).playRps(0, { value: ethers.parseEther("0.01") });
await entropy.fulfill(await arena.getAddress(), 1n, ethers.zeroPadValue("0x02", 32));
assert.equal(await arena.points(player.address), 30n);
const statsAfterWin = await arena.rpsStats(player.address);
assert.equal(statsAfterWin.wins, 1n);
assert.equal(statsAfterWin.currentStreak, 1n);
await arena.connect(player).playRps(1, { value: ethers.parseEther("0.01") });
await entropy.fulfill(await arena.getAddress(), 2n, ethers.zeroPadValue("0x01", 32));
assert.equal(await arena.points(player.address), 42n);
const statsAfterDraw = await arena.rpsStats(player.address);
assert.equal(statsAfterDraw.draws, 1n);
await arena.connect(player).playRps(2, { value: ethers.parseEther("0.01") });
await entropy.fulfill(await arena.getAddress(), 3n, ethers.zeroPadValue("0x00", 32));
assert.equal(await arena.points(player.address), 45n);
const statsAfterLoss = await arena.rpsStats(player.address);
assert.equal(statsAfterLoss.losses, 1n);
assert.equal(statsAfterLoss.currentStreak, 0n);
await arena.connect(player).enterRaffle(1);
assert.equal(await arena.entrantCount(1n), 2n);
assert.equal(await arena.points(player.address), 20n);

console.log("Braid contract smoke tests passed: NFT loan, fee staking, entropy RPS, streak stats, raffle entry.");
