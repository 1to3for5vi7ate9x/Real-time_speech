import { NextResponse } from 'next/server';
import { CartesiaClient } from '@cartesia/cartesia-js';
// import fs from 'fs/promises'; // No longer needed for caching
// import path from 'path'; // No longer needed for caching

// const VOICES_CACHE_PATH = path.resolve(process.cwd(), 'cartesia-voices.json'); // No longer needed
// const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // No longer needed

// interface CachedVoices { // No longer needed
//   timestamp: number;
//   voices: any[]; 
// }

export async function GET() {
  try {
    // Always fetch from Cartesia API
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey || apiKey === 'your_cartesia_api_key_here') {
      console.error('[API/Voices] CARTESIA_API_KEY is not set or is a placeholder.');
      return NextResponse.json({ error: 'Cartesia API key not configured on server.' }, { status: 500 });
    }

    console.log('[API/Voices] Fetching voices directly from Cartesia API (no cache).');
    const cartesia = new CartesiaClient({ apiKey });
    const fetchedVoices = await cartesia.voices.list(); // Assuming this method exists and returns a list
    console.log('[API/Voices] Raw fetchedVoices from Cartesia SDK:', JSON.stringify(fetchedVoices, null, 2));

    // No caching logic needed anymore
    // const newCache: CachedVoices = {
    //   timestamp: Date.now(),
    //   voices: fetchedVoices,
    // };
    // await fs.writeFile(VOICES_CACHE_PATH, JSON.stringify(newCache, null, 2));
    // console.log('[API/Voices] Voices fetched (no caching).');

    // Wrap the voices in an object with a 'voices' property to match what the client expects
    return NextResponse.json({ voices: fetchedVoices });

  } catch (error: any) {
    console.error('[API/Voices] Error fetching voices from Cartesia:', error);
    return NextResponse.json({ error: 'Failed to retrieve voices from Cartesia.', details: error.message }, { status: 500 });
  }
}