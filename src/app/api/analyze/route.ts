import { DLMMAnalyzer } from '../../../lib/solana';

export async function POST(
  request: Request
) {
  const body = await request.json()

  if (!body.lbPairAddress) {
    return Response.json({ error: 'LB Pair address is required' }, { status: 400 });
  }

  try {
    const analyzer = new DLMMAnalyzer();
    const result = await analyzer.analyzeLBPair(body.lbPairAddress);
    
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error('Analysis error:', error);
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}