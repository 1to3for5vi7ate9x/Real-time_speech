import { NextRequest } from 'next/server';
import { CartesiaClient } from '@cartesia/cartesia-js';
import { Readable } from 'stream';

// Helper to convert an AsyncIterable of Cartesia's WebSocketResponse to a ReadableStream of Uint8Arrays (audio chunks)
// Assuming the audio data is in a property like 'audio' or 'chunk' on the yielded item.
// Let's try 'audio' first, then 'chunk' if that fails.
// The Cartesia SDK's WebSocketResponse type needs to be inspected if this assumption is wrong.
// For now, we'll assume item.audio exists and is a Uint8Array.
interface CartesiaSSEChunk {
  audio?: Uint8Array; // Assuming audio data is here
  chunk?: Uint8Array; // Alternative common name
  type?: string; // Type of the chunk (e.g., 'chunk')
  data?: string; // Base64 encoded audio data
  // Add other properties if known from Cartesia's WebSocketResponse type
}

function cartesiaSseToReadableStream(iterable: AsyncIterable<CartesiaSSEChunk>): ReadableStream<Uint8Array> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        // Extract the audio data from the yielded item
        let audioData: Uint8Array | null = null;
        
        // Check for direct Uint8Array in audio or chunk properties
        if (value.audio instanceof Uint8Array) {
          audioData = value.audio;
        } else if (value.chunk instanceof Uint8Array) {
          audioData = value.chunk;
        } else if (value instanceof Uint8Array) {
          // If the item itself is the Uint8Array
          audioData = value;
        } else if (value.type === 'chunk' && typeof value.data === 'string') {
          // Handle the case where data is a base64 string
          try {
            // In browser, we'd use atob() but in Node.js we use Buffer
            const binaryString = Buffer.from(value.data, 'base64');
            audioData = new Uint8Array(binaryString);
          } catch (error) {
            console.error('[API/TTS] Error converting base64 to Uint8Array:', error);
          }
        }
        
        if (audioData) {
          controller.enqueue(audioData);
        } else {
          // Log a warning if the structure is not as expected, but don't break the stream
        }
      }
    },
    async cancel() {
      if (typeof iterator.return === 'function') {
        await iterator.return();
      }
    }
  });
}


export async function POST(request: NextRequest) {
  try {
    const { transcript, language, voiceId } = await request.json();

    if (!transcript || !language || !voiceId) {
      return new Response(JSON.stringify({ error: 'Missing transcript, language, or voiceId.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey || apiKey === 'your_cartesia_api_key_here') {
      console.error('[API/TTS] CARTESIA_API_KEY is not set or is a placeholder.');
      return new Response(JSON.stringify({ error: 'Cartesia API key not configured on server.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const cartesia = new CartesiaClient({ apiKey });

    // Minimal logging for TTS requests
    console.log(`[API/TTS] Request for ${language} using voice ${voiceId.substring(0, 8)}...`);

    const ttsStream = await cartesia.tts.sse({
      modelId: 'sonic-2', // Using the latest model for best quality
      transcript: transcript,
      voice: {
        mode: 'id',
        id: voiceId,
      },
      language: language, // Ensure this matches Cartesia's expected language codes
      outputFormat: {
        container: 'raw',
        encoding: 'pcm_f32le',
        sampleRate: 44100,
      },
      speed: 'normal'
    });

    // The ttsStream is an AsyncIterable<CartesiaSSEChunk (or similar)>. Convert to ReadableStream<Uint8Array>.
    const responseStream = cartesiaSseToReadableStream(ttsStream as AsyncIterable<CartesiaSSEChunk>);
    
    // Return the stream directly. The client will handle consuming it.
    // Set appropriate headers for streaming audio.
    return new Response(responseStream, {
      headers: {
        'Content-Type': 'audio/pcm; codecs=pcm_f32le; sampleRate=44100',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // SSE would typically use 'text/event-stream', but since Cartesia SDK gives us Uint8Array chunks of audio,
        // we stream it as raw audio. If Cartesia SDK gave SSE events, we'd proxy those.
      },
    });

  } catch (error: any) {
    console.error('[API/TTS] Error generating or streaming TTS:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate TTS audio.', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}