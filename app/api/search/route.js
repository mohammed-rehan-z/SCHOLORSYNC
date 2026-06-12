import { SCRAPER_MAP } from "@/lib/scraper";

export async function POST(request) {
  try {
    const { keywords, source } = await request.json();
    if (!keywords || !source) {
      return new Response(JSON.stringify({ error: 'Missing "keywords" or "source"' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const scraper = SCRAPER_MAP[source.toLowerCase()];
    if (!scraper) {
      return new Response(JSON.stringify({ error: 'Unknown source' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let allResults = [];
    await scraper(keywords, 20, (batch) => { allResults.push(...batch); });
    
    return new Response(JSON.stringify({ success: true, count: allResults.length, results: allResults }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
