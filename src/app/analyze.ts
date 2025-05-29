import { NextApiRequest, NextApiResponse } from 'next';
import { DLMMAnalyzer, AnalysisResult } from '../lib/solana';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalysisResult | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lbPairAddress } = req.body;

  if (!lbPairAddress) {
    return res.status(400).json({ error: 'LB Pair address is required' });
  }

  try {
    const analyzer = new DLMMAnalyzer();
    const result = await analyzer.analyzeLBPair(lbPairAddress);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}