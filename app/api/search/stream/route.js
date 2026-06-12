import { SCRAPER_MAP } from "@/lib/scraper";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const keywords = searchParams.get('keywords');
  const source = searchParams.get('source');
  const limit = searchParams.get('limit') || 1000;

  if (!keywords || !source) {
    return new Response(JSON.stringify({ error: 'Missing keywords or source.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetSources = source === 'all' 
    ? Object.keys(SCRAPER_MAP) 
    : [source.toLowerCase()];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':\n\n'));
        } catch (e) {
          clearInterval(pingInterval);
        }
      }, 15000);

      const start = Date.now();
      let totalResults = 0;

      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', message: `Started scraping max ${limit} papers...` })}\n\n`));
      } catch (e) {}

      try {
        await Promise.allSettled(
          targetSources.map(async (src) => {
            const scraper = SCRAPER_MAP[src];
            if (!scraper) return;
            
            await scraper(keywords, parseInt(limit), (resultsBatch) => {
              totalResults += resultsBatch.length;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'results', data: resultsBatch })}\n\n`));
              } catch (e) {}
            });
          })
        );

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', total: totalResults, elapsed: `${elapsed}s` })}\n\n`));
        } catch (e) {}
      } catch (err) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`));
        } catch (e) {}
      } finally {
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch (e) {}
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
