import { DLMMAnalyzer } from '../../../lib/solana';
import Redis from 'ioredis';

// Initialize Redis client
const redis = new Redis(`redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_URL}`);

// Cache TTL in seconds (e.g., 30 minutes for safety)
const CACHE_TTL = 1800;
// Update threshold in milliseconds (5 minutes)
const UPDATE_THRESHOLD = 5 * 60 * 1000;

export async function POST(
  request: Request
) {
  const body = await request.json()

  if (!body.lbPairAddress) {
    return Response.json({ error: 'LB Pair address is required' }, { status: 400 });
  }

  try {
    // Generate cache key
    const cacheKey = `dlmm_analysis:${body.lbPairAddress}`;

    // Check Redis cache first
    const cachedResult = await redis.get(cacheKey);
    
    if (cachedResult) {
      const parsedResult = JSON.parse(cachedResult);
      const lastUpdated = parsedResult.lastUpdated;
      const now = Date.now();
      
      // Check if data is still fresh (less than 5 minutes old)
      if (lastUpdated && (now - lastUpdated) < UPDATE_THRESHOLD) {
        console.log('Cache hit (fresh data) for:', body.lbPairAddress);
        return Response.json(parsedResult, { 
          status: 200,
          headers: {
            'X-Cache': 'HIT'
          }
        });
      } else {
        console.log('Cache expired (>5min old) for:', body.lbPairAddress);
      }
    } else {
      console.log('Cache miss for:', body.lbPairAddress);
    }

    // If not in cache or data is stale, perform fresh analysis
    const analyzer = new DLMMAnalyzer();
    const result = await analyzer.analyzeLBPair(body.lbPairAddress);
    
    // Add timestamp to the result
    const resultWithTimestamp = {
      ...result,
      lastUpdated: Date.now()
    };
    
    // Store result in Redis cache
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resultWithTimestamp));
    console.log('Fresh result cached for:', body.lbPairAddress);
    
    return Response.json(resultWithTimestamp, { 
      status: 200,
      headers: {
        'X-Cache': cachedResult ? 'REFRESH' : 'MISS'
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    
    // If it's a Redis error, log it but don't fail the request
    if (error instanceof Error && error.message.includes('Redis')) {
      console.error('Redis error, proceeding without cache:', error.message);
      
      try {
        const analyzer = new DLMMAnalyzer();
        const result = await analyzer.analyzeLBPair(body.lbPairAddress);
        const resultWithTimestamp = {
          ...result,
          lastUpdated: Date.now()
        };
        return Response.json(resultWithTimestamp, { 
          status: 200,
          headers: {
            'X-Cache': 'BYPASS'
          }
        });
      } catch (analysisError) {
        return Response.json({ 
          error: analysisError instanceof Error ? analysisError.message : 'Unknown error occurred' 
        }, { status: 500 });
      }
    }
    
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}