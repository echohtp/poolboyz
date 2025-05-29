import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const coinGeckoLookup: Record<string, string> = {
  "So11111111111111111111111111111111111111112": "solana",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "bonk",

}

export interface LiquidityData {
  binId: number;
  totalLiquidity: string; // Use string for BigInt serialization
  price: number;
  priceUSD?: number;
}

export interface LBPairMetadata {
  tokenX: string;
  tokenY: string;
  binStep: number;
  decimalsX: number;
  decimalsY: number;
}

export interface AnalysisResult {
  metadata: LBPairMetadata;
  liquidityData: LiquidityData[];
  stats: {
    totalLiquidity: string;
    activeBins: number;
    totalBins: number;
    priceRange: {
      min: number;
      max: number;
    };
    priceRangeUSD?: { // Optional USD price range from backend
      min: number;
      max: number;
    };
  };
}

// Constants
const METEORA_DLMM_PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
const POSITION_V2_DISCRIMINATOR = new Uint8Array([117, 176, 212, 199, 245, 180, 133, 182]);
const POSITION_V2_DISCRIMINATOR_BASE58 = bs58.encode(POSITION_V2_DISCRIMINATOR);

export class DLMMAnalyzer {
  private connection: Connection;

  constructor(rpcUrl: string = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl);
  }

  async getTokenMetadata(tokenMint: PublicKey) {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(tokenMint);
      
      if (!mintInfo.value?.data || typeof mintInfo.value.data !== 'object') {
        return { mint: tokenMint.toString(), decimals: 6 };
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mintData = mintInfo.value.data as any;
      if (mintData.program !== 'spl-token' || !mintData.parsed) {
        return { mint: tokenMint.toString(), decimals: 6 };
      }
      
      return {
        mint: tokenMint.toString(),
        decimals: mintData.parsed.info.decimals
      };
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      return { mint: tokenMint.toString(), decimals: 6 };
    }
  }

  decodeLBPairAccount(accountData: Buffer): { tokenX: PublicKey; tokenY: PublicKey; binStep: number } {
    const dataView = new DataView(accountData.buffer);
    let offset = 8; // Skip discriminator
    
    // Skip parameters struct (64 bytes)
    offset += 64;
    
    // Skip other fields
    offset += 1; // bumpSeed
    offset += 2; // binStepSeed
    offset += 1; // pairType
    offset += 4; // activeId
    
    // Read binStep (u16)
    const binStep = accountData.subarray(offset, offset+2).readInt16LE(0);
    offset += 2;
    
    // Skip more fields
    offset += 1; // status
    offset += 1; // requireBaseFactorSeed
    offset += 2; // baseFactorSeed
    offset += 1; // activationType
    offset += 1; // creatorPoolOnOffControl
    
    // Read tokenXMint (32 bytes)
    const tokenX = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;
    
    // Read tokenYMint (32 bytes)
    const tokenY = new PublicKey(accountData.subarray(offset, offset + 32));
    
    return { tokenX, tokenY, binStep };
  }

  async getLBPairMetadata(lbPairAddress: string): Promise<LBPairMetadata> {
    const accountInfo = await this.connection.getAccountInfo(new PublicKey(lbPairAddress));
    
    if (!accountInfo) {
      throw new Error('LB Pair account not found');
    }
    
    const pairData = this.decodeLBPairAccount(accountInfo.data);
    
    const [tokenXMetadata, tokenYMetadata] = await Promise.all([
      this.getTokenMetadata(pairData.tokenX),
      this.getTokenMetadata(pairData.tokenY)
    ]);
    
    return {
      tokenX: pairData.tokenX.toString(),
      tokenY: pairData.tokenY.toString(),
      binStep: pairData.binStep,
      decimalsX: tokenXMetadata.decimals,
      decimalsY: tokenYMetadata.decimals,
    };
  }

  decodePosition(accountData: Buffer, pubkey: string) {
    const dataView = new DataView(accountData.buffer);
    let offset = 8; // Skip discriminator
    
    // Read lbPair (32 bytes)
    const lbPair = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;
    
    // Read owner (32 bytes)
    const owner = new PublicKey(accountData.subarray(offset, offset + 32));
    offset += 32;
    
    // Read liquidity shares (limit for safety)
    const liquidityShares: bigint[] = [];
    const maxShares = Math.min(70, Math.floor((accountData.length - offset - 200) / 16));
    
    for (let i = 0; i < maxShares; i++) {
      if (offset + 16 <= accountData.length - 200) {
        const low = dataView.getBigUint64(offset, true);
        const high = dataView.getBigUint64(offset + 8, true);
        const value = (high << BigInt(64)) | low;
        liquidityShares.push(value);
        offset += 16;
      } else {
        break;
      }
    }
    
    // Get scalar fields from the end
    const endOffset = accountData.length;
    const lastUpdatedAtOffset = endOffset - 87 - 32 - 1 - 8 - 32 - 16 - 8 - 8;
    const upperBinIdOffset = lastUpdatedAtOffset - 8;
    const lowerBinIdOffset = upperBinIdOffset - 4;
    
    const lowerBinId = dataView.getInt32(lowerBinIdOffset, true);
    const upperBinId = dataView.getInt32(upperBinIdOffset, true);
    const lastUpdatedAt = dataView.getBigInt64(lastUpdatedAtOffset, true);
    
    return {
      pubkey,
      owner,
      lbPair,
      liquidityShares,
      lowerBinId,
      upperBinId,
      lastUpdatedAt
    };
  }


  // Helper function to convert token prices to USD
async convertToUSDPrice(
  priceTokenXPerTokenY: number, 
  tokenXMint: string, 
  tokenYMint: string
): Promise<{ priceTokenXUSD: number; priceTokenYUSD: number }> {
  
  const tokenXPriceUSD = await this.getTokenPriceUSD(tokenXMint);
  const tokenYPriceUSD = await this.getTokenPriceUSD(tokenYMint);
  
  return {
    priceTokenXUSD: tokenXPriceUSD,
    priceTokenYUSD: tokenYPriceUSD
  };
}

async getTokenPriceUSD(tokenMint: string) {
  const _usdcPrice = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoLookup[tokenMint]}&vs_currencies=usd`);
  const tokenPriceUSD = await _usdcPrice.json();

  return tokenPriceUSD[coinGeckoLookup[tokenMint]].usd;
}


  calculatePositionPriceRange(position: {
    upperBinId: number;
    lowerBinId: number;
    liquidityShares: bigint[];
  }, binStep: number, decimalsX: number, decimalsY: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liquidityDistribution: any[] = [];
    let totalLiquidity = BigInt(0);
    
    const binRange = position.upperBinId - position.lowerBinId + 1;
    const maxBins = Math.min(position.liquidityShares.length, binRange);
    
    for (let i = 0; i < maxBins; i++) {
      const liquidity = position.liquidityShares[i];
      if (liquidity > BigInt(0)) {
        const binId = position.lowerBinId + i;
        
        // Calculate base price using the bin formula
        const basePriceForBin = Math.pow(1 + binStep / 10000, binId);
        
        // Apply decimal adjustment: tokenX/tokenY price
        // Formula from Meteora docs: price = (1 + bin_step/10000)^bin_id / 10^(decimalsY - decimalsX)
        const decimalAdjustment = Math.pow(10, decimalsY - decimalsX);
        const priceTokenXPerTokenY = basePriceForBin / decimalAdjustment;
        
        // For bin ranges, each bin represents a specific price point
        // The "max price" for a bin is the price at the next bin
        const nextBinPrice = Math.pow(1 + binStep / 10000, binId + 1) / decimalAdjustment;
        
        liquidityDistribution.push({
          binId,
          liquidity,
          // Price of tokenX in terms of tokenY
          price: priceTokenXPerTokenY,
          minPrice: priceTokenXPerTokenY,
          maxPrice: nextBinPrice
        });
        
        totalLiquidity += liquidity;
      }
    }
    
    return {
      position,
      liquidityDistribution,
      totalLiquidity
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aggregateLiquidityForChart(positionsWithRanges: any[]): LiquidityData[] {
    const liquidityByBin = new Map<number, bigint>();
    const priceByBin = new Map<number, number>();
    
    for (const position of positionsWithRanges) {
      for (const distribution of position.liquidityDistribution) {
        const currentLiquidity = liquidityByBin.get(distribution.binId) || BigInt(0);
        liquidityByBin.set(distribution.binId, currentLiquidity + distribution.liquidity);
        priceByBin.set(distribution.binId, distribution.minPrice);
      }
    }
    
    return Array.from(liquidityByBin.entries())
      .map(([binId, totalLiquidity]) => ({
        binId,
        totalLiquidity: totalLiquidity.toString(), // Convert BigInt to string
        price: priceByBin.get(binId) || 0
      }))
      .sort((a, b) => a.binId - b.binId);
  }

  async analyzeLBPair(lbPairAddress: string): Promise<AnalysisResult> {
    console.log(`Analyzing LB Pair: ${lbPairAddress}`);
    
    // Get metadata
    const metadata = await this.getLBPairMetadata(lbPairAddress);
    console.log(`Metadata: ${JSON.stringify(metadata)}`);

    // Get position accounts
    const accounts = await this.connection.getProgramAccounts(METEORA_DLMM_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: POSITION_V2_DISCRIMINATOR_BASE58
          }
        },
        {
          memcmp: {
            offset: 8,
            bytes: new PublicKey(lbPairAddress).toBase58()
          }
        }
      ]
    });
    
    console.log(`Found ${accounts.length} position accounts`);
    
    if (accounts.length === 0) {
      throw new Error('No positions found for this LB pair');
    }
    
    // Process positions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positionsWithRanges: any[] = [];
    
    for (const account of accounts) {
      try {
        const position = this.decodePosition(account.account.data, account.pubkey.toString());
        const priceRange = this.calculatePositionPriceRange(
          position,
          metadata.binStep,
          metadata.decimalsX,
          metadata.decimalsY
        );
        
        if (priceRange.totalLiquidity > BigInt(0)) {
          positionsWithRanges.push(priceRange);
        }
      } catch (error) {
        console.error('Error processing position:', error);
      }
    }
    
    if (positionsWithRanges.length === 0) {
      throw new Error('No active liquidity found in positions');
    }
    
    // Aggregate liquidity data
    const liquidityData = this.aggregateLiquidityForChart(positionsWithRanges);
    
    // Calculate stats
    const totalLiquidity = liquidityData.reduce((sum, item) => sum + BigInt(item.totalLiquidity), BigInt(0));
    const prices = liquidityData.map(item => item.price);
    
    const stats = {
      totalLiquidity: totalLiquidity.toString(),
      activeBins: liquidityData.filter(item => BigInt(item.totalLiquidity) > BigInt(0)).length,
      totalBins: liquidityData.length,
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices)
      }
    };
    
    console.log(`Analysis complete: ${positionsWithRanges.length} positions, ${liquidityData.length} bins`);
    
    return {
      metadata,
      liquidityData,
      stats
    };
  }
}