import { DLMMAnalyzer } from '../../../lib/solana';
import Redis from 'ioredis';
import { Pool } from 'pg';

// Initialize Redis client
const redis = new Redis(`redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_URL}`);

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

// Cache TTL in seconds (e.g., 30 minutes for safety)
const CACHE_TTL = 1800;
// Update threshold in milliseconds (5 minutes)
const UPDATE_THRESHOLD = 5 * 60 * 1000;

// Consistent data structure for storage
interface StoredAnalysisData {
  lbPairAddress: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysisResult: any; // Your AnalysisResult type
  lastUpdated: number;
  createdAt: number;
}

async function saveAnalysisToPostgres(lbPairAddress: string, analysisData: StoredAnalysisData) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO dlmm_analyses (lb_pair_address, analysis_data)
      VALUES ($1, $2)
      RETURNING id, created_at, updated_at
    `;
    const result = await client.query(query, [
      lbPairAddress, 
      JSON.stringify(analysisData)
    ]);
    console.log('Saved to PostgreSQL:', result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error('PostgreSQL save error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getLatestAnalysisFromPostgres(lbPairAddress: string): Promise<StoredAnalysisData | null> {
  const client = await pool.connect();
  try {
    // Use the custom function we created
    const query = `SELECT * FROM get_latest_analysis($1)`;
    const result = await client.query(query, [lbPairAddress]);
    
    if (result.rows[0]) {
      const storedData = JSON.parse(result.rows[0].analysis_data) as StoredAnalysisData;
      return storedData;
    }
    
    return null;
  } catch (error) {
    console.error('PostgreSQL fetch error:', error);
    return null;
  } finally {
    client.release();
  }
}

// Helper function to create consistent storage format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createStoredData(lbPairAddress: string, analysisResult: any): StoredAnalysisData {
  const now = Date.now();
  return {
    lbPairAddress,
    analysisResult,
    lastUpdated: now,
    createdAt: now
  };
}

// Helper function to extract response data
function extractResponseData(storedData: StoredAnalysisData) {
  return {
    ...storedData.analysisResult,
    lastUpdated: storedData.lastUpdated,
    _metadata: {
      lbPairAddress: storedData.lbPairAddress,
      lastUpdated: storedData.lastUpdated,
      createdAt: storedData.createdAt
    }
  };
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.lbPairAddress) {
    return Response.json({ error: 'LB Pair address is required' }, { status: 400 });
  }

  try {
    const cacheKey = `dlmm_analysis:${body.lbPairAddress}`;
    let shouldPerformAnalysis = false;
    let cacheStatus = 'MISS';

    // 1. Check Redis cache first
    const cachedResult = await redis.get(cacheKey);
    
    if (cachedResult) {
      const storedData: StoredAnalysisData = JSON.parse(cachedResult);
      const now = Date.now();
      
      // Check if data is still fresh (less than 5 minutes old)
      if (storedData.lastUpdated && (now - storedData.lastUpdated) < UPDATE_THRESHOLD) {
        console.log('Cache hit (fresh data) for:', body.lbPairAddress);
        return Response.json(extractResponseData(storedData), { 
          status: 200,
          headers: { 'X-Cache': 'HIT' }
        });
      } else {
        console.log('Cache expired (>5min old) for:', body.lbPairAddress);
        shouldPerformAnalysis = true;
        cacheStatus = 'REFRESH';
      }
    } else {
      // 2. If not in Redis, check PostgreSQL for recent data
      console.log('Cache miss, checking PostgreSQL for:', body.lbPairAddress);
      const storedData = await getLatestAnalysisFromPostgres(body.lbPairAddress);
      
      if (storedData) {
        const now = Date.now();
        
        if ((now - storedData.lastUpdated) < UPDATE_THRESHOLD) {
          // Recent data exists in PostgreSQL, use it and cache it
          console.log('Found recent data in PostgreSQL for:', body.lbPairAddress);
          
          // Cache the PostgreSQL result in Redis
          await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(storedData));
          
          return Response.json(extractResponseData(storedData), { 
            status: 200,
            headers: { 'X-Cache': 'DB-HIT' }
          });
        } else {
          shouldPerformAnalysis = true;
          cacheStatus = 'DB-REFRESH';
        }
      } else {
        shouldPerformAnalysis = true;
        cacheStatus = 'MISS';
      }
    }

    // 3. Perform fresh analysis if needed
    if (shouldPerformAnalysis) {
      console.log('Performing fresh analysis for:', body.lbPairAddress);
      
      const analyzer = new DLMMAnalyzer();
      const analysisResult = await analyzer.analyzeLBPair(body.lbPairAddress);
      
      // Create consistent storage format
      const storedData = createStoredData(body.lbPairAddress, analysisResult);

      // 4. Save to PostgreSQL (fire and forget - don't block response)
      saveAnalysisToPostgres(body.lbPairAddress, storedData).catch(err => 
        console.error('Failed to save to PostgreSQL:', err)
      );

      // 5. Cache in Redis with consistent format
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(storedData));
      console.log('Fresh result cached for:', body.lbPairAddress);
      
      return Response.json(extractResponseData(storedData), { 
        status: 200,
        headers: { 'X-Cache': cacheStatus }
      });
    }

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Fallback: try to get any recent data from PostgreSQL
    try {
      const storedData = await getLatestAnalysisFromPostgres(body.lbPairAddress);
      if (storedData) {
        console.log('Returning PostgreSQL fallback data for:', body.lbPairAddress);
        return Response.json(extractResponseData(storedData), { 
          status: 200,
          headers: { 'X-Cache': 'DB-FALLBACK' }
        });
      }
    } catch (pgError) {
      console.error('PostgreSQL fallback failed:', pgError);
    }
    
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

