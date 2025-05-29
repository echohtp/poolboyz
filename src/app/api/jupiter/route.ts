// pages/api/jupiter/orders.ts
import { JupiterOrderAnalyzer } from '../../../lib/jupiter';
import Redis from 'ioredis';
import { Pool } from 'pg';

const dev_mode : boolean = (process.env.DEV_MODE=="1");

// Initialize Redis client
const redis = (dev_mode) ? null : new Redis(`redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_URL}`);

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

// Cache TTL in seconds (30 minutes for safety)
const CACHE_TTL = 1800;
// Update threshold in milliseconds (3 minutes for orders - more frequent updates)
const UPDATE_THRESHOLD = 3 * 60 * 1000;

interface OrderRequest {
  type: 'inputMint' | 'maker' | 'both';
  inputMint?: string;
  maker?: string;
}

// Generate cache key based on request parameters
function generateCacheKey(type: string, inputMint?: string, maker?: string): string {
  switch (type) {
    case 'inputMint':
      return `jupiter_orders:inputMint:${inputMint}`;
    case 'maker':
      return `jupiter_orders:maker:${maker}`;
    case 'both':
      return `jupiter_orders:both:${inputMint}:${maker}`;
    default:
      throw new Error('Invalid cache key type');
  }
}

// Generate identifier for PostgreSQL storage
function generateIdentifier(type: string, inputMint?: string, maker?: string): string {
  switch (type) {
    case 'inputMint':
      return `inputMint:${inputMint}`;
    case 'maker':
      return `maker:${maker}`;
    case 'both':
      return `both:${inputMint}:${maker}`;
    default:
      throw new Error('Invalid identifier type');
  }
}

async function saveOrdersToPostgres(
  queryType: string,
  identifier: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ordersData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysisData: any
) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO jupiter_orders (query_type, identifier, orders_data, analysis_data)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (query_type, identifier) 
      DO UPDATE SET 
        orders_data = EXCLUDED.orders_data,
        analysis_data = EXCLUDED.analysis_data,
        updated_at = NOW()
      RETURNING id, created_at, updated_at
    `;
    const result = await client.query(query, [
      queryType, 
      identifier, 
      JSON.stringify(ordersData), 
      JSON.stringify(analysisData)
    ]);
    console.log('Saved Jupiter orders to PostgreSQL:', result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error('PostgreSQL save error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getLatestOrdersFromPostgres(queryType: string, identifier: string) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT orders_data, analysis_data, updated_at
      FROM jupiter_orders 
      WHERE query_type = $1 AND identifier = $2
      ORDER BY updated_at DESC 
      LIMIT 1
    `;
    const result = await client.query(query, [queryType, identifier]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('PostgreSQL fetch error:', error);
    return null;
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  const { type, inputMint, maker }: OrderRequest = await req.json();

  if (!type) {
    return new Response('Type is required', { status: 400 });
  }

  // Validate required parameters based on type
  if (type === 'inputMint' && !inputMint) {
    return new Response('Input mint is required', { status: 400 });
  }
  if (type === 'maker' && !maker) {
    return new Response('Maker is required', { status: 400 });
  }
  if (type === 'both' && (!inputMint || !maker)) {
    return new Response('Both input mint and maker are required', { status: 400 });
  }

  try {
    const cacheKey = generateCacheKey(type, inputMint, maker);
    const identifier = generateIdentifier(type, inputMint, maker);
    let shouldPerformAnalysis = false;
    let cacheStatus = 'MISS';

    if (redis==null){
      shouldPerformAnalysis = true;
    }
    else
    {
      // 1. Check Redis cache first
      const cachedResult = await redis.get(cacheKey);
      
      if (cachedResult) {
        const parsedResult = JSON.parse(cachedResult);
        const lastUpdated = parsedResult.lastUpdated;
        const now = Date.now();
        
        // Check if data is still fresh (less than 3 minutes old)
        if (lastUpdated && (now - lastUpdated) < UPDATE_THRESHOLD) {
          console.log('Cache hit (fresh data) for Jupiter orders:', identifier);
          return new Response(JSON.stringify(parsedResult), { 
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'X-Cache': 'HIT' 
            }
          });
        } else {
          console.log('Cache expired (>3min old) for Jupiter orders:', identifier);
          shouldPerformAnalysis = true;
          cacheStatus = 'REFRESH';
        }
      } else {
        // 2. If not in Redis, check PostgreSQL for recent data
        console.log('Cache miss, checking PostgreSQL for Jupiter orders:', identifier);
        const pgResult = await getLatestOrdersFromPostgres(type, identifier);
        
        if (pgResult) {
          const updatedAt = new Date(pgResult.updated_at).getTime();
          const now = Date.now();
          
          if ((now - updatedAt) < UPDATE_THRESHOLD) {
            // Recent data exists in PostgreSQL, use it and cache it
            console.log('Found recent Jupiter orders data in PostgreSQL:', identifier);
            const resultWithTimestamp = {
              orders: pgResult.orders_data,
              analysis: pgResult.analysis_data,
              lastUpdated: updatedAt
            };
            
            // Cache the PostgreSQL result
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resultWithTimestamp));
            
            return new Response(JSON.stringify(resultWithTimestamp), { 
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'X-Cache': 'DB-HIT' 
              }
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
    }

    // 3. Perform fresh analysis if needed
    if (shouldPerformAnalysis) {
      console.log('Performing fresh Jupiter orders analysis:', identifier);
      
      const analyzer = new JupiterOrderAnalyzer();
      let orders = [];

      // Fetch orders based on type
      switch (type) {
        case 'inputMint':
          orders = await analyzer.getOrdersByInputMint(inputMint!);
          break;
        case 'maker':
          orders = await analyzer.getOrdersByMaker(maker!);
          break;
        case 'both':
          orders = await analyzer.getOrdersByInputMintAndMaker(inputMint!, maker!);
          break;
        default:
          return new Response('Invalid type', { status: 400 });
      }

      // Enrich orders with price data
      const enrichedOrders = await Promise.all(
        orders.map(order => analyzer.enrichOrderWithPrice(order))
      );

      // Analyze orders
      const analysis = await analyzer.analyzeOrders(orders);

      const resultWithTimestamp = {
        orders: enrichedOrders,
        analysis,
        lastUpdated: Date.now()
      };

      // 4. Save to PostgreSQL (fire and forget - don't block response)
      saveOrdersToPostgres(type, identifier, enrichedOrders, analysis).catch(err => 
        console.error('Failed to save Jupiter orders to PostgreSQL:', err)
      );

      // 5. Cache in Redis
      if (redis!=null){
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resultWithTimestamp));
        console.log('Fresh Jupiter orders result cached:', identifier);
      }
      
      return new Response(JSON.stringify(resultWithTimestamp), { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-Cache': cacheStatus 
        }
      });
    }

  } catch (error) {
    console.error('Jupiter orders analysis error:', error);
    
    // Fallback: try to get any recent data from PostgreSQL
    try {
      const identifier = generateIdentifier(type, inputMint, maker);
      const pgResult = await getLatestOrdersFromPostgres(type, identifier);
      if (pgResult) {
        console.log('Returning PostgreSQL fallback data for Jupiter orders:', identifier);
        return new Response(JSON.stringify({
          orders: pgResult.orders_data,
          analysis: pgResult.analysis_data,
          lastUpdated: new Date(pgResult.updated_at).getTime()
        }), { 
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'X-Cache': 'DB-FALLBACK' 
          }
        });
      }
    } catch (pgError) {
      console.error('PostgreSQL fallback failed:', pgError);
    }
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Optional: GET endpoint to retrieve historical data
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const queryType = searchParams.get('type');
  const inputMint = searchParams.get('inputMint');
  const maker = searchParams.get('maker');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (!queryType) {
    return new Response('Type parameter is required', { status: 400 });
  }

  try {
    const identifier = generateIdentifier(queryType, inputMint || undefined, maker || undefined);
    const client = await pool.connect();
    
    const query = `
      SELECT orders_data, analysis_data, created_at, updated_at
      FROM jupiter_orders 
      WHERE query_type = $1 AND identifier = $2
      ORDER BY updated_at DESC 
      LIMIT $3
    `;
    
    const result = await client.query(query, [queryType, identifier, limit]);
    client.release();
    
    return new Response(JSON.stringify({
      history: result.rows.map(row => ({
        orders: row.orders_data,
        analysis: row.analysis_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to fetch history' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
