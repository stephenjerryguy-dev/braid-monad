"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  isAddress,
  parseEther,
  type Address,
} from "viem";
import { monadTestnet } from "viem/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const STAKING_ADDRESS = process.env.NEXT_PUBLIC_BRAID_STAKING_ADDRESS ?? "";
const ARENA_ADDRESS = process.env.NEXT_PUBLIC_BRAID_ARENA_ADDRESS ?? "";
const contractsLive = isAddress(STAKING_ADDRESS) && isAddress(ARENA_ADDRESS);

const stakingAbi = [
  { type: "function", name: "stake", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

const arenaAbi = [
  { type: "function", name: "entropyFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "playRps", stateMutability: "payable", inputs: [{ name: "playerMove", type: "uint8" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "enterRaffle", stateMutability: "nonpayable", inputs: [{ name: "extraEntries", type: "uint8" }], outputs: [] },
] as const;

type RpsAction = "rock" | "paper" | "scissors";
type Action = "stake" | RpsAction | "raffle";
type MatchResult = "WIN" | "DRAW" | "LOSS";

const rpsMoves: Record<RpsAction, { index: 0 | 1 | 2; label: string; glyph: string }> = {
  rock: { index: 0, label: "ROCK", glyph: "●" },
  paper: { index: 1, label: "PAPER", glyph: "▱" },
  scissors: { index: 2, label: "SCISSORS", glyph: "✕" },
};

const tutorialSteps = [
  { key: "capital", time: "00:00", eyebrow: "CAPITAL RAIL", title: "Start with a real need.", copy: "Borrow against an NFT or memecoin position, or fund the exact terms as a lender. No floor-price oracle decides the loan." },
  { key: "move", time: "00:14", eyebrow: "LOCK THE MOVE", title: "Choose before randomness exists.", copy: "A human or agent wallet locks Rock, Paper, or Scissors on Monad. Braid cannot change the move after submission." },
  { key: "entropy", time: "00:29", eyebrow: "VERIFIABLE RESOLUTION", title: "Pyth reveals the counter-move.", copy: "Entropy V2 returns after two blocks. The arena contract resolves the match and records points, streaks, and the proof sequence." },
  { key: "loop", time: "00:44", eyebrow: "BRAID THE ACTIVITY", title: "One action feeds the next.", copy: "Loan interest rewards MON stakers. Arena points buy extra raffle entries. The winner receives an onchain SVG proof badge." },
] as const;

const offers = [
  {
    type: "NFT",
    tag: "MONANIMALS",
    name: "Monanimal #404",
    ask: "18.00 MON",
    repay: "19.26 MON",
    term: "14 days",
    score: 82,
    signal: "Deep bids · low rarity drift",
    art: "orb",
    accent: "lime",
  },
  {
    type: "MEME",
    tag: "$CHOG",
    name: "5,000,000 CHOG",
    ask: "6.00 MON",
    repay: "6.63 MON",
    term: "21 days",
    score: 71,
    signal: "Liquid pair · volatile tail",
    art: "stripes",
    accent: "violet",
  },
];

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Home() {
  const [account, setAccount] = useState<Address>();
  const [busy, setBusy] = useState<Action>();
  const [toast, setToast] = useState("");
  const [activeOffer, setActiveOffer] = useState<(typeof offers)[number]>();
  const [stakeAmount, setStakeAmount] = useState("0.10");
  const [demoPoints, setDemoPoints] = useState(40);
  const [lastMatch, setLastMatch] = useState<{ player: RpsAction; opponent: RpsAction; result: MatchResult }>();
  const [demoRecord, setDemoRecord] = useState({ wins: 0, draws: 0, losses: 0, streak: 0 });
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPlaying, setTutorialPlaying] = useState(true);

  const publicClient = useMemo(
    () => createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") }),
    [],
  );

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    document.body.classList.add("motion-ready");
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -8%", threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.body.classList.remove("motion-ready");
    };
  }, []);

  useEffect(() => {
    if (!tutorialPlaying) return;
    const timer = window.setInterval(() => {
      setTutorialStep((step) => (step + 1) % tutorialSteps.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [tutorialPlaying]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setToast("No injected wallet found. Install MetaMask, Rabby, or Phantom EVM.");
      return undefined;
    }
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x279f",
          chainName: "Monad Testnet",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: ["https://testnet-rpc.monad.xyz"],
          blockExplorerUrls: ["https://testnet.monadscan.com"],
        }],
      });
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as Address[];
      setAccount(accounts[0]);
      setToast("Wallet connected to Monad Testnet.");
      return accounts[0];
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Wallet connection was cancelled.");
      return undefined;
    }
  }, []);

  const rehearse = useCallback(async (action: Action) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    if (action === "rock" || action === "paper" || action === "scissors") {
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      const opponent = (Object.keys(rpsMoves) as RpsAction[])[random % 3];
      const playerIndex = rpsMoves[action].index;
      const opponentIndex = rpsMoves[opponent].index;
      const result: MatchResult = playerIndex === opponentIndex
        ? "DRAW"
        : (playerIndex + 1) % 3 === opponentIndex ? "LOSS" : "WIN";
      const nextStreak = result === "WIN" ? demoRecord.streak + 1 : result === "LOSS" ? 0 : demoRecord.streak;
      const award = result === "WIN" ? 25 + Math.min(nextStreak, 5) * 5 : result === "DRAW" ? 12 : 3;
      setLastMatch({ player: action, opponent, result });
      setDemoRecord((record) => ({
        wins: record.wins + (result === "WIN" ? 1 : 0),
        draws: record.draws + (result === "DRAW" ? 1 : 0),
        losses: record.losses + (result === "LOSS" ? 1 : 0),
        streak: nextStreak,
      }));
      setDemoPoints((value) => value + award);
      setToast(`${result}: ${rpsMoves[action].label} vs ${rpsMoves[opponent].label}. +${award} demo points. Testnet matches use Pyth Entropy.`);
    } else if (action === "raffle") {
      setDemoPoints((value) => Math.max(0, value - 25));
      setToast("Rehearsal entry added. Contract addresses are required for an onchain entry.");
    } else {
      setToast(`Rehearsal stake: ${stakeAmount} MON. No wallet transaction was submitted.`);
    }
  }, [demoRecord.streak, stakeAmount]);

  const execute = useCallback(async (action: Action) => {
    setBusy(action);
    setToast("");
    try {
      if (!contractsLive) {
        await rehearse(action);
        return;
      }
      const activeAccount = account ?? await connect();
      if (!activeAccount || !window.ethereum) return;
      const wallet = createWalletClient({ account: activeAccount, chain: monadTestnet, transport: custom(window.ethereum) });
      let hash: Address;
      if (action === "stake") {
        const value = parseEther(stakeAmount);
        const estimate = await publicClient.estimateContractGas({
          account: activeAccount,
          address: STAKING_ADDRESS as Address,
          abi: stakingAbi,
          functionName: "stake",
          value,
        });
        hash = await wallet.writeContract({
          address: STAKING_ADDRESS as Address,
          abi: stakingAbi,
          functionName: "stake",
          value,
          gas: estimate + estimate / 10n,
        });
      } else if (action === "raffle") {
        const estimate = await publicClient.estimateContractGas({
          account: activeAccount,
          address: ARENA_ADDRESS as Address,
          abi: arenaAbi,
          functionName: "enterRaffle",
          args: [0],
        });
        hash = await wallet.writeContract({
          address: ARENA_ADDRESS as Address,
          abi: arenaAbi,
          functionName: "enterRaffle",
          args: [0],
          gas: estimate + estimate / 10n,
        });
      } else {
        const fee = await publicClient.readContract({
          address: ARENA_ADDRESS as Address,
          abi: arenaAbi,
          functionName: "entropyFee",
        });
        const move = rpsMoves[action].index;
        const estimate = await publicClient.estimateContractGas({
          account: activeAccount,
          address: ARENA_ADDRESS as Address,
          abi: arenaAbi,
          functionName: "playRps",
          args: [move],
          value: fee,
        });
        hash = await wallet.writeContract({
          address: ARENA_ADDRESS as Address,
          abi: arenaAbi,
          functionName: "playRps",
          args: [move],
          value: fee,
          gas: estimate + estimate / 10n,
        });
        setToast(`${rpsMoves[action].label} locked. Pyth request submitted with ${formatEther(fee)} MON.`);
      }
      await publicClient.waitForTransactionReceipt({ hash });
      setToast(action === "rock" || action === "paper" || action === "scissors"
        ? `Move confirmed · Pyth resolves after 2 blocks · ${shortAddress(hash)}`
        : `Confirmed on Monad Testnet · ${shortAddress(hash)}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message.split("\n")[0] : "Transaction failed.");
    } finally {
      setBusy(undefined);
    }
  }, [account, connect, publicClient, rehearse, stakeAmount]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Braid home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>BRAID</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#tutorial">Tour</a>
          <a href="#market">Market</a>
          <a href="#stake">Stake</a>
          <a href="#arena">Arena</a>
          <a href="#protocol">Protocol</a>
        </nav>
        <button className="wallet-button" onClick={connect}>
          <span className="pulse" /> {account ? shortAddress(account) : "Connect wallet"}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy" data-reveal>
          <div className="eyebrow"><span>MONAD TESTNET</span><span>HUMANS + AGENTS</span></div>
          <h1>Borrow.<br />Stake. <em>Play.</em></h1>
          <p className="hero-lede">One capital rail for NFT collectors, memecoin traders, lenders, and autonomous agents.</p>
          <div className="hero-actions">
            <a className="primary-action" href="#market">Enter the market <span>↗</span></a>
            <a className="text-action" href="#protocol">Read the mechanism <span>↓</span></a>
          </div>
        </div>
        <div className="hero-art" aria-label="Braided capital rails illustration" data-reveal data-delay="1">
          <span className="art-label top">NO ORACLE FOR LOANS</span>
          <svg className="hero-weave" viewBox="0 0 760 680" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g className="contour-lines">
              <path d="M-40 92C160 16 250 165 405 118S665 24 810 88" />
              <path d="M-55 132C145 56 252 205 415 158S675 64 820 128" />
              <path d="M-70 172C130 96 254 245 425 198S685 104 830 168" />
              <path d="M-85 212C115 136 256 285 435 238S695 144 840 208" />
            </g>
            <g className="woven-rail rail-lime">
              <path className="rail-edge" d="M-90 38C115 105 265 255 427 334S646 465 835 596" />
              <path className="rail-fill" d="M-90 38C115 105 265 255 427 334S646 465 835 596" />
              <path className="rail-glint" d="M-90 38C115 105 265 255 427 334S646 465 835 596" />
            </g>
            <g className="woven-rail rail-cream">
              <path className="rail-edge" d="M-110 608C95 545 247 392 402 318S650 174 850 82" />
              <path className="rail-fill" d="M-110 608C95 545 247 392 402 318S650 174 850 82" />
              <path className="rail-glint" d="M-110 608C95 545 247 392 402 318S650 174 850 82" />
            </g>
            <g className="woven-rail rail-violet">
              <path className="rail-edge" d="M-95 425C118 455 267 558 425 584S650 566 845 650" />
              <path className="rail-fill" d="M-95 425C118 455 267 558 425 584S650 566 845 650" />
              <path className="rail-glint" d="M-95 425C118 455 267 558 425 584S650 566 845 650" />
            </g>
            <g className="signal-dashes">
              <path d="M-10 286C174 264 270 179 395 218S615 341 780 260" />
              <path d="M34 642C214 600 278 476 443 472S630 527 756 488" />
            </g>
          </svg>
          <span className="art-node node-a">NFT</span>
          <span className="art-node node-b">MON</span>
          <span className="art-node node-c">AI</span>
          <span className="art-label bottom">SETTLED ON MONAD</span>
        </div>
      </section>

      <section className="ticker" aria-label="Protocol status">
        <div className="ticker-track">
          {[0, 1].map((copy) => <div className="ticker-set" key={copy} aria-hidden={copy === 1}>
            <span><b>BUILD</b> JUL 15, 2026</span>
            <span><b>NETWORK</b> MONAD 10143</span>
            <span><b>RANDOMNESS</b> PYTH ENTROPY V2</span>
            <span><b>STATE</b> {contractsLive ? "TESTNET LIVE" : "LOCAL CONTRACT BUILD"}</span>
          </div>)}
        </div>
      </section>

      <section className="tutorial-section" id="tutorial">
        <div className="tutorial-heading" data-reveal>
          <span className="kicker">00 / INTERACTIVE FIELD GUIDE</span>
          <h2>Understand Braid<br /><em>in sixty seconds.</em></h2>
          <p>Press play or choose a chapter. Every scene maps to an actual contract action—not a fictional dashboard metric.</p>
        </div>
        <div className="tutorial-player" data-reveal data-delay="1">
          <div className="tutorial-video" aria-live="polite">
            <div className="video-chrome"><span>PRODUCT FILM / MONAD TESTNET</span><span>CHAPTER {String(tutorialStep + 1).padStart(2, "0")}</span></div>
            <div className={`tutorial-scene scene-${tutorialSteps[tutorialStep].key}`}>
              <div className="scene-grid" aria-hidden="true" />
              <div className="scene-capital" aria-hidden="true"><i /><i /><i /></div>
              <div className="scene-wallet" aria-hidden="true">YOU</div>
              <div className="scene-agent" aria-hidden="true">AI</div>
              <div className="scene-proof" aria-hidden="true"><b>PYTH</b><span>VERIFIED</span></div>
              <div className="scene-badge" aria-hidden="true"><i /><i /><b>01</b></div>
              <div className="scene-caption">
                <span>{tutorialSteps[tutorialStep].eyebrow}</span>
                <h3>{tutorialSteps[tutorialStep].title}</h3>
                <p>{tutorialSteps[tutorialStep].copy}</p>
              </div>
            </div>
            <div className="video-controls">
              <button className="play-control" onClick={() => setTutorialPlaying((playing) => !playing)} aria-label={tutorialPlaying ? "Pause tutorial" : "Play tutorial"}>{tutorialPlaying ? "Ⅱ" : "▶"}</button>
              <div className="video-timeline" aria-label="Tutorial progress">
                {tutorialSteps.map((step, index) => <button key={step.key} className={index === tutorialStep ? "active" : ""} onClick={() => { setTutorialStep(index); setTutorialPlaying(false); }} aria-label={`Open chapter ${index + 1}: ${step.title}`}><i /></button>)}
              </div>
              <span>{tutorialSteps[tutorialStep].time} / 00:58</span>
            </div>
          </div>
          <ol className="tutorial-chapters">
            {tutorialSteps.map((step, index) => (
              <li key={step.key} className={index === tutorialStep ? "active" : ""}>
                <button onClick={() => { setTutorialStep(index); setTutorialPlaying(false); }}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><small>{step.time}</small><strong>{step.title}</strong></div>
                  <b>↗</b>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="market-section" id="market">
        <div className="section-heading" data-reveal>
          <div><span className="kicker">01 / CREDIT MARKET</span><h2>Collateral is a conversation.</h2></div>
          <p>Lenders publish funded terms. Borrowers choose. AI explains the risk; it never gets to seize the keys.</p>
        </div>
        <div className="market-grid">
          <div className="offer-list">
            <div className="list-head"><span>OPEN OFFERS / ILLUSTRATIVE</span><button>Newest ↓</button></div>
            {offers.map((offer) => (
              <article className="offer-card" key={offer.name} data-reveal>
                <div className={`asset-art ${offer.art} ${offer.accent}`}><span>{offer.type}</span></div>
                <div className="offer-main">
                  <span className="offer-tag">{offer.tag} · AGENT #42</span>
                  <h3>{offer.name}</h3>
                  <p>{offer.signal}</p>
                  <div className="offer-stats">
                    <span><small>BORROW</small>{offer.ask}</span>
                    <span><small>REPAY</small>{offer.repay}</span>
                    <span><small>TERM</small>{offer.term}</span>
                  </div>
                </div>
                <div className="score-block">
                  <span className="score-ring">{offer.score}</span>
                  <small>BRAID<br />SCORE</small>
                  <button onClick={() => setActiveOffer(offer)}>Inspect ↗</button>
                </div>
              </article>
            ))}
          </div>
          <aside className="agent-panel" data-reveal data-delay="1">
            <div className="agent-head"><span className="agent-orb">✣</span><div><small>ACTIVE ANALYST</small><strong>Braid Scout</strong></div><span className="online">ONLINE</span></div>
            <p>“Floor price is noise. I compare executable bids, wallet concentration, and exit depth.”</p>
            <div className="agent-readout"><span>MAX LTV</span><b>42%</b><i style={{ width: "42%" }} /></div>
            <div className="agent-readout"><span>VOLATILITY CAP</span><b>68</b><i style={{ width: "68%" }} /></div>
            <div className="agent-readout"><span>HUMAN APPROVAL</span><b>ON</b><i style={{ width: "100%" }} /></div>
            <div className="agent-foot"><span>ERC-8004 READY</span><span>POLICY HASH 8F…2C</span></div>
          </aside>
        </div>
      </section>

      <section className="capital-section" id="stake">
        <div className="stake-copy" data-reveal>
          <span className="kicker">02 / STAKE THE RAIL</span>
          <h2>Earn from fees.<br /><em>Not emissions.</em></h2>
          <p>Stake MON into the fee rail. When borrowers repay, 10% of loan interest flows to stakers pro rata. Empty market, empty yield—no invented APY.</p>
          <div className="truth-label">YIELD SOURCE <b>LOAN INTEREST</b></div>
        </div>
        <div className="stake-card" data-reveal data-delay="1">
          <div className="stake-card-head"><span>YOUR STAKE</span><span>{contractsLive ? "LIVE" : "REHEARSAL"}</span></div>
          <label>Amount <span>Balance —</span></label>
          <div className="amount-input"><input value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} inputMode="decimal" /><b>MON</b></div>
          <div className="preset-row">{["0.10", "0.50", "1.00"].map((value) => <button key={value} onClick={() => setStakeAmount(value)}>{value}</button>)}</div>
          <div className="stake-summary"><span>Share of pool<b>Calculated onchain</b></span><span>Reward source<b>10% of interest</b></span></div>
          <button className="block-action" disabled={busy === "stake"} onClick={() => execute("stake")}>{busy === "stake" ? "Preparing…" : `${contractsLive ? "Stake" : "Rehearse"} ${stakeAmount || "0"} MON`} <span>↗</span></button>
          <small className="fine-print">No promised return. Smart contracts are unaudited and testnet-only.</small>
        </div>
      </section>

      <section className="arena-section" id="arena">
        <div className="section-heading light" data-reveal>
          <div><span className="kicker">03 / BRAID ARENA</span><h2>Outplay the agent.<br />Not the odds.</h2></div>
          <p>Lock Rock, Paper, or Scissors. Pyth reveals the arena move afterward, so neither Braid nor an AI agent can rig the match.</p>
        </div>
        <div className="arena-grid">
          <article className="game-card" data-reveal>
            <div className="game-top"><span>VERIFIABLE RPS</span><span>{contractsLive ? "PYTH LIVE" : "REHEARSAL"}</span></div>
            <div className="rps-stage">
              <div className="rps-fighter player-fighter">
                <small>YOU / WALLET</small>
                <b>{lastMatch ? rpsMoves[lastMatch.player].glyph : "?"}</b>
                <span>{lastMatch ? rpsMoves[lastMatch.player].label : "LOCK MOVE"}</span>
              </div>
              <div className={`rps-result ${lastMatch ? lastMatch.result.toLowerCase() : ""}`}>
                <i>VS</i>
                <strong>{lastMatch?.result ?? "READY"}</strong>
                <small>PYTH ENTROPY V2</small>
              </div>
              <div className="rps-fighter agent-fighter">
                <small>ARENA / AGENT</small>
                <b>{lastMatch ? rpsMoves[lastMatch.opponent].glyph : "✣"}</b>
                <span>{lastMatch ? rpsMoves[lastMatch.opponent].label : "HIDDEN"}</span>
              </div>
            </div>
            <div className="rps-record"><span><small>WINS</small>{demoRecord.wins}</span><span><small>DRAWS</small>{demoRecord.draws}</span><span><small>LOSSES</small>{demoRecord.losses}</span><span><small>STREAK</small>{demoRecord.streak}</span></div>
            <p>Your move is stored before the counter-move exists. Win streaks multiply points; points buy extra proof-badge raffle entries.</p>
            <div className="choice-row">
              {(Object.entries(rpsMoves) as [RpsAction, (typeof rpsMoves)[RpsAction]][]).map(([move, meta]) => (
                <button key={move} disabled={!!busy} onClick={() => execute(move)}><i>{meta.glyph}</i><span>{meta.label}</span></button>
              ))}
            </div>
            <div className="proof-rail"><span><b>01</b> MOVE LOCKED</span><span><b>02</b> PYTH REVEALS</span><span><b>03</b> CONTRACT SCORES</span></div>
          </article>
          <article className="raffle-card" data-reveal data-delay="1">
            <span className="raffle-kicker">PROOF BADGE RAFFLE</span>
            <div className="badge-art"><i /><i /><b>01</b></div>
            <h3>Win the first braid.</h3>
            <p>A fully onchain SVG badge. One free entry per round. Extra entries cost 25 points.</p>
            <div className="raffle-stats"><span><small>YOUR POINTS</small>{demoPoints}</span><span><small>ENTRIES</small>{demoPoints >= 25 ? 2 : 1}</span><span><small>DRAW</small>24H</span></div>
            <button className="raffle-action" disabled={!!busy || demoPoints < 25} onClick={() => execute("raffle")}>{contractsLive ? "Enter raffle" : "Rehearse entry"} <span>↗</span></button>
            <small>Badge only · no cash value · testnet MON pays randomness gas</small>
          </article>
        </div>
      </section>

      <section className="protocol-section" id="protocol">
        <div className="protocol-title" data-reveal><span className="kicker">04 / THE BRAID</span><h2>One loop.<br />Four actors.</h2></div>
        <ol className="mechanism" data-reveal data-delay="1">
          <li><span>01</span><div><h3>Lenders publish terms</h3><p>Principal is funded up front. Offers can target an NFT ID or exact ERC-20 amount.</p></div></li>
          <li><span>02</span><div><h3>Humans or agents accept</h3><p>Collateral enters escrow; MON reaches the borrower in the same transaction.</p></div></li>
          <li><span>03</span><div><h3>Repayment feeds stakers</h3><p>The lender receives principal plus interest, less a transparent share of interest.</p></div></li>
          <li><span>04</span><div><h3>Agents play by human rules</h3><p>Any wallet can enter RPS, but Pyth produces the counter-move after the player move is locked. The same entropy rail draws badge winners.</p></div></li>
        </ol>
      </section>

      <footer>
        <div className="footer-brand"><span className="brand-mark"><i /><i /><i /></span><strong>BRAID</strong></div>
        <p>Oracleless credit for expressive assets.<br />Built fresh for Spark on Monad.</p>
        <div className="footer-links"><a href="https://docs.monad.xyz" target="_blank" rel="noreferrer">Monad docs ↗</a><a href="https://docs.pyth.network/entropy" target="_blank" rel="noreferrer">Pyth Entropy ↗</a></div>
        <small>TESTNET PROTOTYPE · UNAUDITED · NO FINANCIAL VALUE</small>
      </footer>

      {toast && <button className="toast" onClick={() => setToast("")} aria-label="Dismiss notification"><span>{contractsLive ? "CHAIN" : "REHEARSAL"}</span>{toast}<b>×</b></button>}

      {activeOffer && <div className="modal-backdrop" role="presentation" onClick={() => setActiveOffer(undefined)}>
        <section className="offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setActiveOffer(undefined)} aria-label="Close">×</button>
          <span className="kicker">TERM SHEET / ILLUSTRATIVE</span><h2 id="offer-title">{activeOffer.name}</h2>
          <p>{activeOffer.signal}. The displayed offer demonstrates the contract schema; it is not currently funded onchain.</p>
          <div className="modal-terms"><span>Principal<b>{activeOffer.ask}</b></span><span>Repayment<b>{activeOffer.repay}</b></span><span>Duration<b>{activeOffer.term}</b></span><span>AI reference<b>ERC-8004 #42</b></span></div>
          <div className="modal-warning"><b>WHAT THE AI CAN’T DO</b> Move collateral, change signed terms, draw raffle winners, or bypass your wallet approval.</div>
          <button className="block-action" onClick={() => setToast("This illustrative offer is not funded onchain. Deploy and seed the market first.")}>Review accept flow <span>↗</span></button>
        </section>
      </div>}
    </main>
  );
}
