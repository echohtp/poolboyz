'use client';

import React, { useState } from 'react';
import LiquidityChart from './components/LiquidityChart';
import { AnalysisResult } from '../lib/solana';

export default function Home() {
  const [lbPairAddress, setLbPairAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleAddresses = [
    {
      pair: 'USELESS/SOL',
      address: 'BBXyTX5UfbASibLRo3iaptuwF5846njxm7M4xFQTQz3d'
    },
    {
      pair: 'USELESS/USDC',
      address: 'BjvE4DgUXukHgdtYYSSjQwETZ2XLQJV5aurSVUUhewk3'
    },
    {
      pair: 'HOUSE/SOL',
      address: '3ELd7jBF7scUQupEWrex2wbxsX49bJGizzYZZnzh8HpL'
    },
    {
      pair: 'HOUSE/USDC',
      address: '9V98cPfLchV8RWp5rScfidzrmTdo6bDKxCdSGmiGQSQJ'
    },
    
    
  ];

  const handleAnalyze = async () => {
    if (!lbPairAddress.trim()) {
      setError('Please enter an LB Pair address');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lbPairAddress: lbPairAddress.trim() }),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent mb-4">
            🌊 DLMM Liquidity Analyzer
          </h1>
          <p className="text-gray-300 text-xl">
            Analyze Meteora DLMM pool liquidity distribution in real-time
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="lbPairAddress" className="block text-white font-semibold mb-2">
                LB Pair Address
              </label>
              <input
                type="text"
                id="lbPairAddress"
                value={lbPairAddress}
                onChange={(e) => setLbPairAddress(e.target.value)}
                placeholder="Enter Meteora DLMM LB Pair address..."
                className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>

          {/* Sample Addresses */}
          <div className="mt-6">
            <h4 className="text-white font-semibold mb-3">📋 Sample LB Pair Addresses:</h4>
            <div className="space-y-2">
              {sampleAddresses.map((sample, index) => (
                <div
                  key={index}
                  onClick={() => setLbPairAddress(sample.address)}
                  className="flex justify-between items-center p-3 bg-black/20 rounded-lg cursor-pointer hover:bg-black/30 transition-colors"
                >
                  <span className="text-blue-400 font-semibold">{sample.pair}</span>
                  <span className="text-gray-400 font-mono text-sm">{sample.address}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300">
              ❌ {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 p-4 bg-blue-500/20 border border-blue-500/40 rounded-lg text-blue-300">
              🔍 Analyzing liquidity distribution...
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-8">
            {/* Metadata */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">📊 Pool Metadata</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Token X</div>
                  <div className="text-blue-400 font-semibold">
                    {result.metadata.tokenX.slice(0, 8)}...
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Token Y</div>
                  <div className="text-blue-400 font-semibold">
                    {result.metadata.tokenY.slice(0, 8)}...
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Bin Step</div>
                  <div className="text-blue-400 font-semibold">
                    {result.metadata.binStep} ({(result.metadata.binStep / 100).toFixed(2)}%)
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Decimals</div>
                  <div className="text-blue-400 font-semibold">
                    {result.metadata.decimalsX}/{result.metadata.decimalsY}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Price Range</div>
                  <div className="text-blue-400 font-semibold">
                    ${result.stats.priceRange.min.toFixed(6)} - ${result.stats.priceRange.max.toFixed(6)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Active Bins</div>
                  <div className="text-blue-400 font-semibold">
                    {result.stats.activeBins}/{result.stats.totalBins}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Total Liquidity</div>
                  <div className="text-blue-400 font-semibold">
                    {Number(result.stats.totalLiquidity).toExponential(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
                <h3 className="text-xl font-bold text-white mb-4 text-center">📈 Liquidity Distribution Histogram</h3>
                <LiquidityChart 
                  data={result.liquidityData} 
                  type="histogram" 
                  title="Liquidity by Price Level"
                />
              </div>

              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
                <h3 className="text-xl font-bold text-white mb-4 text-center">🔥 Liquidity Heatmap</h3>
                <LiquidityChart 
                  data={result.liquidityData} 
                  type="heatmap" 
                  title="Liquidity Intensity Distribution"
                />
              </div>

              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
                <h3 className="text-xl font-bold text-white mb-4 text-center">📊 Cumulative Liquidity</h3>
                <LiquidityChart 
                  data={result.liquidityData} 
                  type="cumulative" 
                  title="Individual vs Cumulative Liquidity"
                />
              </div>
            </div>

            {/* Success Message */}
            <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-4 text-green-300 text-center">
              ✅ Analysis complete! Processed {result.stats.activeBins} active liquidity bins
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
