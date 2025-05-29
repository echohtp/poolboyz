'use client';

import React, { useState } from 'react';
import JupiterOrderChart from '../components/JupiterOrderChart';

interface OrderAnalysis {
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

interface OrderResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[];
  analysis: OrderAnalysis;
}

export default function JupiterPage() {
  const [queryType, setQueryType] = useState<'inputMint' | 'maker' | 'both'>('inputMint');
  const [inputMint, setInputMint] = useState('');
  const [maker, setMaker] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const knownTokens = [
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
    { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
    { symbol: 'mSOL', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So' },
  ];

  const sampleMakers = [
    '232PpcrPc6Kz7geafvbRzt5HnHP4kX88yvzUCN69WXQC',
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  ];

  const handleAnalyze = async () => {
    if (queryType === 'inputMint' && !inputMint.trim()) {
      setError('Please enter an input mint address');
      return;
    }
    if (queryType === 'maker' && !maker.trim()) {
      setError('Please enter a maker address');
      return;
    }
    if (queryType === 'both' && (!inputMint.trim() || !maker.trim())) {
      setError('Please enter both input mint and maker addresses');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/jupiter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: queryType,
          inputMint: inputMint.trim() || undefined,
          maker: maker.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'text-green-400';
      case 'expired': return 'text-red-400';
      case 'filled': return 'text-blue-400';
      case 'partial': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-blue-600 bg-clip-text text-transparent mb-4">
            🪐 Jupiter Limit Orders Analyzer
          </h1>
          <p className="text-gray-300 text-xl">
            Analyze Jupiter limit orders with real-time data and interactive charts
          </p>
        </div>

        {/* Query Section */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-8">
          <div className="mb-6">
            <label className="block text-white font-semibold mb-3">Query Type</label>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setQueryType('inputMint')}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  queryType === 'inputMint'
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-black/20 border-white/20 text-gray-300 hover:bg-black/30'
                }`}
              >
                By Input Token
              </button>
              <button
                onClick={() => setQueryType('maker')}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  queryType === 'maker'
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-black/20 border-white/20 text-gray-300 hover:bg-black/30'
                }`}
              >
                By Maker
              </button>
              <button
                onClick={() => setQueryType('both')}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  queryType === 'both'
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-black/20 border-white/20 text-gray-300 hover:bg-black/30'
                }`}
              >
                Both
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {(queryType === 'inputMint' || queryType === 'both') && (
              <div>
                <label htmlFor="inputMint" className="block text-white font-semibold mb-2">
                  Input Token Mint
                </label>
                <input
                  type="text"
                  id="inputMint"
                  value={inputMint}
                  onChange={(e) => setInputMint(e.target.value)}
                  placeholder="Enter token mint address..."
                  className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {knownTokens.map((token) => (
                    <button
                      key={token.mint}
                      onClick={() => setInputMint(token.mint)}
                      className="px-3 py-1 text-sm bg-purple-600/20 text-purple-300 rounded border border-purple-500/30 hover:bg-purple-600/30 transition-colors"
                    >
                      {token.symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(queryType === 'maker' || queryType === 'both') && (
              <div>
                <label htmlFor="maker" className="block text-white font-semibold mb-2">
                  Maker Address
                </label>
                <input
                  type="text"
                  id="maker"
                  value={maker}
                  onChange={(e) => setMaker(e.target.value)}
                  placeholder="Enter maker address..."
                  className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {sampleMakers.map((address, index) => (
                    <button
                      key={address}
                      onClick={() => setMaker(address)}
                      className="px-3 py-1 text-sm bg-blue-600/20 text-blue-300 rounded border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                    >
                      Sample {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
          >
            {loading ? 'Analyzing Orders...' : 'Analyze Orders'}
          </button>

          {/* Status Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300">
              ❌ {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 p-4 bg-purple-500/20 border border-purple-500/40 rounded-lg text-purple-300">
              🔍 Fetching and analyzing Jupiter limit orders...
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-8">
            {/* Summary Stats */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">📊 Order Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400">{result.analysis.totalOrders}</div>
                  <div className="text-gray-400 text-sm">Total Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400">{result.analysis.activeOrders}</div>
                  <div className="text-gray-400 text-sm">Active</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-400">{result.analysis.expiredOrders}</div>
                  <div className="text-gray-400 text-sm">Expired</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-400">{result.analysis.filledOrders}</div>
                  <div className="text-gray-400 text-sm">Filled</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400">{result.analysis.partialOrders}</div>
                  <div className="text-gray-400 text-sm">Partial</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">
                    {result.analysis.priceRange.average > 0 ? result.analysis.priceRange.average.toFixed(4) : 'N/A'}
                  </div>
                  <div className="text-gray-400 text-sm">Avg Price</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">
                    {formatNumber(result.analysis.averageOrderSize.input)}
                  </div>
                  <div className="text-gray-400 text-sm">Avg Size</div>
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Order Status Chart */}
              {result.analysis.ordersByStatus.length > 0 && (
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <JupiterOrderChart
                    data={result.analysis.ordersByStatus.map(item => ({
                      ...item,
                      status: 'status',
                      pair: 'N/A',
                      price: 0,
                      range: 'N/A'
                    }))}
                    type="status"
                    title="Orders by Status"
                  />
                </div>
              )}

              {/* Token Pairs Chart */}
              {result.analysis.ordersByToken.length > 0 && (
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <JupiterOrderChart
                    data={result.analysis.ordersByToken.map(item => ({
                      ...item,
                      status: 'token',
                      pair: 'N/A',
                      price: 0,
                      range: 'N/A'
                    }))}
                    type="tokens"
                    title="Top Token Pairs"
                  />
                </div>
              )}

              {/* Price Distribution Chart */}
              {result.analysis.priceDistribution.length > 0 && (
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <JupiterOrderChart
                    data={result.analysis.priceDistribution.map(item => ({
                      ...item,
                      status: 'price',
                      pair: 'N/A',
                      range: 'N/A'
                    }))}
                    type="prices"
                    title="Price Distribution"
                  />
                </div>
              )}

              {/* Volume Distribution Chart */}
              {result.analysis.volumeDistribution.length > 0 && (
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <JupiterOrderChart
                    data={result.analysis.volumeDistribution.map(item => ({
                      ...item,
                      status: 'volume',
                      pair: 'N/A',
                      price: 0
                    }))}
                    type="volume"
                    title="Orders by Volume Range"
                  />
                </div>
              )}
            </div>

            {/* Order Details Table */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
              <h3 className="text-2xl font-bold text-white mb-6">📋 Order Details</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-white font-semibold py-3 px-2">Order ID</th>
                      <th className="text-left text-white font-semibold py-3 px-2">Pair</th>
                      <th className="text-right text-white font-semibold py-3 px-2">Making</th>
                      <th className="text-right text-white font-semibold py-3 px-2">Taking</th>
                      <th className="text-right text-white font-semibold py-3 px-2">Price</th>
                      <th className="text-center text-white font-semibold py-3 px-2">Status</th>
                      <th className="text-right text-white font-semibold py-3 px-2">Filled %</th>
                      <th className="text-right text-white font-semibold py-3 px-2">Fee (bps)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.orders.slice(0, 20).map((order) => (
                      <tr key={order.pubkey} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-2 text-gray-300 font-mono text-xs">
                          {order.pubkey.slice(0, 8)}...
                        </td>
                        <td className="py-3 px-2 text-white">
                          {order.inputToken.symbol}/{order.outputToken.symbol}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-300">
                          {order.makingAmountAdjusted.toFixed(4)} {order.inputToken.symbol}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-300">
                          {order.takingAmountAdjusted.toFixed(4)} {order.outputToken.symbol}
                        </td>
                        <td className="py-3 px-2 text-right text-white">
                          {order.pricePerInputToken.toFixed(6)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(order.status)}`}>
                            {order.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right text-gray-300">
                          {order.filledPercentage.toFixed(1)}%
                        </td>
                        <td className="py-3 px-2 text-right text-gray-300">
                          {order.feeBps}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {result.orders.length > 20 && (
                  <div className="mt-4 text-center text-gray-400">
                    Showing 20 of {result.orders.length} orders
                  </div>
                )}
              </div>
            </div>

            {/* Success Message */}
            <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-4 text-green-300 text-center">
              ✅ Analysis complete! Found {result.analysis.totalOrders} orders 
              ({result.analysis.activeOrders} active, {result.analysis.expiredOrders} expired)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}