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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveAnalysisToPostgres(lbPairAddress: string, analysisData: any) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO dlmm_analyses (lb_pair_address, analysis_data)
      VALUES ($1, $2)
      RETURNING id, created_at
    `;
    const result = await client.query(query, [lbPairAddress, JSON.stringify(analysisData)]);
    console.log('Saved to PostgreSQL:', result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error('PostgreSQL save error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getLatestAnalysisFromPostgres(lbPairAddress: string) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT analysis_data, created_at
      FROM dlmm_analyses 
      WHERE lb_pair_address = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const result = await client.query(query, [lbPairAddress]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('PostgreSQL fetch error:', error);
    return null;
  } finally {
    client.release();
  }
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
      const parsedResult = JSON.parse(cachedResult);
      const lastUpdated = parsedResult.lastUpdated;
      const now = Date.now();
      
      // Check if data is still fresh (less than 5 minutes old)
      if (lastUpdated && (now - lastUpdated) < UPDATE_THRESHOLD) {
        console.log('Cache hit (fresh data) for:', body.lbPairAddress);
        return Response.json(parsedResult, { 
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
      const pgResult = await getLatestAnalysisFromPostgres(body.lbPairAddress);
      
      if (pgResult) {
        const createdAt = new Date(pgResult.created_at).getTime();
        const now = Date.now();
        
        if ((now - createdAt) < UPDATE_THRESHOLD) {
          // Recent data exists in PostgreSQL, use it and cache it
          console.log('Found recent data in PostgreSQL for:', body.lbPairAddress);
          const resultWithTimestamp = {
            ...pgResult.analysis_data,
            lastUpdated: createdAt
          };
          
          // Cache the PostgreSQL result
          await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resultWithTimestamp));
          
          return Response.json(resultWithTimestamp, { 
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
      const result = await analyzer.analyzeLBPair(body.lbPairAddress);
      
      const resultWithTimestamp = {
        ...result,
        lastUpdated: Date.now()
      };

      // 4. Save to PostgreSQL (fire and forget - don't block response)
      saveAnalysisToPostgres(body.lbPairAddress, result).catch(err => 
        console.error('Failed to save to PostgreSQL:', err)
      );

      // 5. Cache in Redis
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resultWithTimestamp));
      console.log('Fresh result cached for:', body.lbPairAddress);
      
      return Response.json(resultWithTimestamp, { 
        status: 200,
        headers: { 'X-Cache': cacheStatus }
      });
    }

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Fallback: try to get any recent data from PostgreSQL
    try {
      const pgResult = await getLatestAnalysisFromPostgres(body.lbPairAddress);
      if (pgResult) {
        console.log('Returning PostgreSQL fallback data for:', body.lbPairAddress);
        return Response.json({
          ...pgResult.analysis_data,
          lastUpdated: new Date(pgResult.created_at).getTime()
        }, { 
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

// Optional: Add a cleanup endpoint for old data
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const daysOld = parseInt(searchParams.get('days') || '30');
  
  try {
    const client = await pool.connect();
    const query = `
      DELETE FROM dlmm_analyses 
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
    `;
    const result = await client.query(query);
    client.release();
    
    return Response.json({ 
      message: `Deleted ${result.rowCount} old records`,
      deletedCount: result.rowCount 
    });
  } catch (error) {
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Delete failed' 
    }, { status: 500 });
  }
}