import { Connection, PublicKey } from '@solana/web3.js';

export interface JupiterLimitOrder {
  pubkey: string;
  maker: string;
  inputMint: string;
  outputMint: string;
  inputTokenProgram: string;
  outputTokenProgram: string;
  inputMintReserve: string;
  uniqueId: string;
  oriMakingAmount: string;
  oriTakingAmount: string;
  makingAmount: string;
  takingAmount: string;
  borrowMakingAmount: string;
  expiredAt: string | null;
  feeBps: number;
  feeAccount: string;
  createdAt: string;
  updatedAt: string;
  bump: number;
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface OrderWithPrice extends JupiterLimitOrder {
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  pricePerInputToken: number;
  pricePerOutputToken: number;
  status: 'active' | 'expired' | 'filled' | 'partial';
  filledPercentage: number;
  makingAmountAdjusted: number;
  takingAmountAdjusted: number;
}

export interface OrderAnalysis {
  totalOrders: number;
  activeOrders: number;
  expiredOrders: number;
  filledOrders: number;
  partialOrders: number;
  totalVolume: {
    input: string;
    output: string;
  };
  averageOrderSize: {
    input: number;
    output: number;
  };
  priceRange: {
    min: number;
    max: number;
    average: number;
  };
  ordersByToken: Array<{ pair: string; count: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
  priceDistribution: Array<{ price: number; count: number }>;
  volumeDistribution: Array<{ range: string; count: number }>;
}

export class JupiterOrderAnalyzer {
  private connection: Connection;
  private jupiterProgramId: PublicKey;
  private tokenCache: Map<string, TokenInfo> = new Map();

  constructor(rpcUrl: string = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl);
    this.jupiterProgramId = new PublicKey('j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X');
  }

  decodeOrder(accountData: Buffer, pubkey: string): JupiterLimitOrder {
    let offset = 8; // Skip discriminator

    // Read maker (32 bytes)
    const maker = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read inputMint (32 bytes)
    const inputMint = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read outputMint (32 bytes)
    const outputMint = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read inputTokenProgram (32 bytes)
    const inputTokenProgram = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read outputTokenProgram (32 bytes)
    const outputTokenProgram = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read inputMintReserve (32 bytes)
    const inputMintReserve = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read uniqueId (u64 - 8 bytes)
    const uniqueId = accountData.readBigUInt64LE(offset);
    offset += 8;

    // Read oriMakingAmount (u64 - 8 bytes)
    const oriMakingAmount = accountData.readBigUInt64LE(offset);
    offset += 8;

    // Read oriTakingAmount (u64 - 8 bytes)
    const oriTakingAmount = accountData.readBigUInt64LE(offset);
    offset += 8;

    // Read makingAmount (u64 - 8 bytes)
    const makingAmount = accountData.readBigUInt64LE(offset);
    offset += 8;

    // Read takingAmount (u64 - 8 bytes)
    const takingAmount = accountData.readBigUInt64LE(offset);
    offset += 8;

    // Read borrowMakingAmount (u64 - 8 bytes)
    const borrowMakingAmount = accountData.readBigUInt64LE(offset);
    offset += 8;

    // Read expiredAt (Option<i64> - 1 byte for option + 8 bytes for value)
    const hasExpiredAt = accountData.readUInt8(offset);
    offset += 1;
    let expiredAt: bigint | null = null;
    if (hasExpiredAt) {
      expiredAt = accountData.readBigInt64LE(offset);
    }
    offset += 8; // Always advance 8 bytes

    // Read feeBps (u16 - 2 bytes)
    const feeBps = accountData.readUInt16LE(offset);
    offset += 2;

    // Read feeAccount (32 bytes)
    const feeAccount = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;

    // Read createdAt (i64 - 8 bytes)
    const createdAt = accountData.readBigInt64LE(offset);
    offset += 8;

    // Read updatedAt (i64 - 8 bytes)
    const updatedAt = accountData.readBigInt64LE(offset);
    offset += 8;

    // Read bump (u8 - 1 byte)
    const bump = accountData.readUInt8(offset);

    return {
      pubkey,
      maker: maker.toString(),
      inputMint: inputMint.toString(),
      outputMint: outputMint.toString(),
      inputTokenProgram: inputTokenProgram.toString(),
      outputTokenProgram: outputTokenProgram.toString(),
      inputMintReserve: inputMintReserve.toString(),
      uniqueId: uniqueId.toString(),
      oriMakingAmount: oriMakingAmount.toString(),
      oriTakingAmount: oriTakingAmount.toString(),
      makingAmount: makingAmount.toString(),
      takingAmount: takingAmount.toString(),
      borrowMakingAmount: borrowMakingAmount.toString(),
      expiredAt: expiredAt?.toString() || null,
      feeBps,
      feeAccount: feeAccount.toString(),
      createdAt: createdAt.toString(),
      updatedAt: updatedAt.toString(),
      bump,
    };
  }

  async getTokenInfo(mintAddress: string): Promise<TokenInfo> {
    if (this.tokenCache.has(mintAddress)) {
      return this.tokenCache.get(mintAddress)!;
    }

    // Known tokens
    const knownTokens: Record<string, TokenInfo> = {
      'So11111111111111111111111111111111111111112': { 
        mint: mintAddress, symbol: 'SOL', name: 'Solana', decimals: 9 
      },
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { 
        mint: mintAddress, symbol: 'USDC', name: 'USD Coin', decimals: 6 
      },
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { 
        mint: mintAddress, symbol: 'USDT', name: 'Tether USD', decimals: 6 
      },
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { 
        mint: mintAddress, symbol: 'mSOL', name: 'Marinade SOL', decimals: 9 
      },
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { 
        mint: mintAddress, symbol: 'bSOL', name: 'BlazeStake SOL', decimals: 9 
      },
    };

    if (knownTokens[mintAddress]) {
      this.tokenCache.set(mintAddress, knownTokens[mintAddress]);
      return knownTokens[mintAddress];
    }

    try {
      const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));
      
      let decimals = 6;
      if (mintInfo.value?.data && typeof mintInfo.value.data === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mintData = mintInfo.value.data as any;
        if (mintData.program === 'spl-token' && mintData.parsed?.info?.decimals !== undefined) {
          decimals = mintData.parsed.info.decimals;
        }
      }

      const tokenInfo: TokenInfo = {
        mint: mintAddress,
        symbol: mintAddress.slice(0, 4).toUpperCase(),
        name: 'Unknown Token',
        decimals,
      };

      this.tokenCache.set(mintAddress, tokenInfo);
      return tokenInfo;
    } catch (error) {
      console.error('Error getting token info:', error);
      const fallbackInfo: TokenInfo = {
        mint: mintAddress,
        symbol: mintAddress.slice(0, 4).toUpperCase(),
        name: 'Unknown Token',
        decimals: 6,
      };
      
      this.tokenCache.set(mintAddress, fallbackInfo);
      return fallbackInfo;
    }
  }

  async enrichOrderWithPrice(order: JupiterLimitOrder): Promise<OrderWithPrice> {
    const [inputToken, outputToken] = await Promise.all([
      this.getTokenInfo(order.inputMint),
      this.getTokenInfo(order.outputMint),
    ]);

    const makingAmountAdjusted = Number(order.makingAmount) / Math.pow(10, inputToken.decimals);
    const takingAmountAdjusted = Number(order.takingAmount) / Math.pow(10, outputToken.decimals);

    const pricePerInputToken = makingAmountAdjusted > 0 ? takingAmountAdjusted / makingAmountAdjusted : 0;
    const pricePerOutputToken = takingAmountAdjusted > 0 ? makingAmountAdjusted / takingAmountAdjusted : 0;

    // Determine status
    let status: 'active' | 'expired' | 'filled' | 'partial' = 'active';
    
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (order.expiredAt && BigInt(order.expiredAt) < now) {
      status = 'expired';
    } else if (BigInt(order.makingAmount) === BigInt(0)) {
      status = 'filled';
    } else if (BigInt(order.makingAmount) < BigInt(order.oriMakingAmount)) {
      status = 'partial';
    }

    const filledPercentage = BigInt(order.oriMakingAmount) > BigInt(0) 
      ? Number((BigInt(order.oriMakingAmount) - BigInt(order.makingAmount)) * BigInt(100) / BigInt(order.oriMakingAmount))
      : 0;

    return {
      ...order,
      inputToken,
      outputToken,
      pricePerInputToken,
      pricePerOutputToken,
      status,
      filledPercentage,
      makingAmountAdjusted,
      takingAmountAdjusted,
    };
  }

  async getOrdersByInputMint(inputMint: string): Promise<JupiterLimitOrder[]> {
    const accounts = await this.connection.getProgramAccounts(this.jupiterProgramId, {
      filters: [
        {
          memcmp: {
            offset: 8 + 32, // Skip discriminator + maker
            bytes: new PublicKey(inputMint).toBase58(),
          },
        },
      ],
    });

    const orders: JupiterLimitOrder[] = [];
    for (const account of accounts) {
      try {
        const order = this.decodeOrder(account.account.data, account.pubkey.toString());
        orders.push(order);
      } catch (error) {
        console.error('Failed to decode order:', error);
      }
    }

    return orders;
  }

  async getOrdersByMaker(maker: string): Promise<JupiterLimitOrder[]> {
    const accounts = await this.connection.getProgramAccounts(this.jupiterProgramId, {
      filters: [
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: new PublicKey(maker).toBase58(),
          },
        },
      ],
    });

    const orders: JupiterLimitOrder[] = [];
    for (const account of accounts) {
      try {
        const order = this.decodeOrder(account.account.data, account.pubkey.toString());
        orders.push(order);
      } catch (error) {
        console.error('Failed to decode order:', error);
      }
    }

    return orders;
  }

  async getOrdersByInputMintAndMaker(inputMint: string, maker: string): Promise<JupiterLimitOrder[]> {
    const accounts = await this.connection.getProgramAccounts(this.jupiterProgramId, {
      filters: [
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: new PublicKey(maker).toBase58(),
          },
        },
        {
          memcmp: {
            offset: 8 + 32, // Skip discriminator + maker
            bytes: new PublicKey(inputMint).toBase58(),
          },
        },
      ],
    });

    const orders: JupiterLimitOrder[] = [];
    for (const account of accounts) {
      try {
        const order = this.decodeOrder(account.account.data, account.pubkey.toString());
        orders.push(order);
      } catch (error) {
        console.error('Failed to decode order:', error);
      }
    }

    return orders;
  }

  async analyzeOrders(orders: JupiterLimitOrder[]): Promise<OrderAnalysis> {
    const enrichedOrders = await Promise.all(
      orders.map(order => this.enrichOrderWithPrice(order))
    );

    const activeOrders = enrichedOrders.filter(o => o.status === 'active').length;
    const expiredOrders = enrichedOrders.filter(o => o.status === 'expired').length;
    const filledOrders = enrichedOrders.filter(o => o.status === 'filled').length;
    const partialOrders = enrichedOrders.filter(o => o.status === 'partial').length;

    const totalInputVolume = orders.reduce((sum, order) => sum + BigInt(order.oriMakingAmount), BigInt(0));
    const totalOutputVolume = orders.reduce((sum, order) => sum + BigInt(order.oriTakingAmount), BigInt(0));

    const prices = enrichedOrders
      .map(o => o.pricePerInputToken)
      .filter(p => p > 0 && isFinite(p));

    const priceRange = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices),
      average: prices.reduce((sum, p) => sum + p, 0) / prices.length,
    } : { min: 0, max: 0, average: 0 };

    // Count orders by token pair
    const tokenPairCounts = new Map<string, number>();
    enrichedOrders.forEach(order => {
      const pair = `${order.inputToken.symbol}/${order.outputToken.symbol}`;
      tokenPairCounts.set(pair, (tokenPairCounts.get(pair) || 0) + 1);
    });

    const ordersByToken = Array.from(tokenPairCounts.entries())
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count);

    // Status distribution
    const ordersByStatus = [
      { status: 'Active', count: activeOrders },
      { status: 'Expired', count: expiredOrders },
      { status: 'Filled', count: filledOrders },
      { status: 'Partial', count: partialOrders },
    ].filter(item => item.count > 0);

    // Price distribution (binned)
    const priceDistribution: Array<{ price: number; count: number }> = [];
    if (prices.length > 0) {
      const bins = 10;
      const binSize = (priceRange.max - priceRange.min) / bins;
      
      for (let i = 0; i < bins; i++) {
        const binStart = priceRange.min + (i * binSize);
        const binEnd = binStart + binSize;
        const count = prices.filter(p => p >= binStart && p < binEnd).length;
        
        if (count > 0) {
          priceDistribution.push({
            price: binStart + (binSize / 2),
            count
          });
        }
      }
    }

    // Volume distribution
    const volumes = enrichedOrders.map(o => o.makingAmountAdjusted);
    const volumeRanges = [
      { min: 0, max: 10, label: '0-10' },
      { min: 10, max: 100, label: '10-100' },
      { min: 100, max: 1000, label: '100-1K' },
      { min: 1000, max: 10000, label: '1K-10K' },
      { min: 10000, max: Infinity, label: '10K+' },
    ];

    const volumeDistribution = volumeRanges.map(range => ({
      range: range.label,
      count: volumes.filter(v => v >= range.min && v < range.max).length
    })).filter(item => item.count > 0);

    return {
      totalOrders: orders.length,
      activeOrders,
      expiredOrders,
      filledOrders,
      partialOrders,
      totalVolume: {
        input: totalInputVolume.toString(),
        output: totalOutputVolume.toString(),
      },
      averageOrderSize: {
        input: orders.length > 0 ? Number(totalInputVolume) / orders.length : 0,
        output: orders.length > 0 ? Number(totalOutputVolume) / orders.length : 0,
      },
      priceRange,
      ordersByToken,
      ordersByStatus,
      priceDistribution,
      volumeDistribution,
    };
  }
}
