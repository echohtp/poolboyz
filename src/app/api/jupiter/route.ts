// pages/api/jupiter/orders.ts
import { JupiterOrderAnalyzer } from '../../../lib/jupiter';

interface OrderRequest {
  type: 'inputMint' | 'maker' | 'both';
  inputMint?: string;
  maker?: string;
}

export async function POST(
  req: Request,
) {
  const { type, inputMint, maker }: OrderRequest = await req.json();

  if (!type) {
    return new Response('Type is required', { status: 400 });
  }

  try {
    const analyzer = new JupiterOrderAnalyzer();
    let orders = [];

    switch (type) {
      case 'inputMint':
        if (!inputMint) {
          return new Response('Input mint is required', { status: 400 });
        }
        orders = await analyzer.getOrdersByInputMint(inputMint);
        break;

      case 'maker':
        if (!maker) {
          return new Response('Maker is required', { status: 400 });
        }
        orders = await analyzer.getOrdersByMaker(maker);
        break;

      case 'both':
        if (!inputMint || !maker) {
          return new Response('Both input mint and maker are required', { status: 400 });
        }
        orders = await analyzer.getOrdersByInputMintAndMaker(inputMint, maker);
        break;

      default:
        return new Response('Invalid type', { status: 400 });
    }

    const enrichedOrders = await Promise.all(
      orders.map(order => analyzer.enrichOrderWithPrice(order))
    );

    const analysis = await analyzer.analyzeOrders(orders);

    return new Response(JSON.stringify({
      orders: enrichedOrders,
      analysis
    }), { status: 200 });

  } catch (error) {
    console.error('Jupiter orders analysis error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), { status: 500 });
  }
}

