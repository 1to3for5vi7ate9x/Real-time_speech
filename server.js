require('dotenv').config(); // Load .env.local variables

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws'); // Import WebSocket for readyState check

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Create a WebSocket server instance, but don't attach it to the httpServer directly yet.
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'];
    console.log(`[Custom Server ASR] Client connected from ${clientIp} to ${req.url}`);

    const assemblyAiApiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!assemblyAiApiKey || assemblyAiApiKey === 'your_assemblyai_api_key_here') {
      console.error('[Custom Server ASR] ASSEMBLYAI_API_KEY is not set or is a placeholder.');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Server configuration error: Missing or placeholder AssemblyAI API key.' }));
        ws.close(1008, 'API Key not configured');
      }
      return;
    }

    // Align with AssemblyAI SDK example:
    const { AssemblyAI } = require('assemblyai');
    const assemblyAIClient = new AssemblyAI({ apiKey: assemblyAiApiKey });
    const transcriber = assemblyAIClient.realtime.transcriber({
      sampleRate: 16000, // Re-instating explicit sample rate
    });

    // Helper function to safely send messages to the client WebSocket
    const safeSendToClient = (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(data));
        } catch (e) {
          console.error('[Custom Server ASR] Error sending message to client:', e);
        }
      }
    };

    // Track if AssemblyAI session is ready
    let isAssemblyAIReady = false;
    let audioQueue = [];

    // Helper function to process queued audio
    const processQueuedAudio = () => {
      if (isAssemblyAIReady && audioQueue.length > 0) {
        console.log(`[Custom Server ASR] Processing ${audioQueue.length} queued audio chunks`);
        audioQueue.forEach((audioData) => {
          try {
            transcriber.sendAudio(audioData);
          } catch (e) {
            console.error('[Custom Server ASR] Error sending queued audio to AssemblyAI:', e);
          }
        });
        audioQueue = [];
      }
    };

    // Helper function to safely close the AssemblyAI transcriber
    const safeCloseTranscriber = () => {
      try {
        isAssemblyAIReady = false;
        audioQueue = [];
        if (transcriber && typeof transcriber.close === 'function') {
          // Check if the transcriber has a state like `isOpen` or similar if provided by SDK
          // For now, just attempt to close and catch errors.
          transcriber.close().catch(e => console.error("[Custom Server ASR] Error during transcriber.close():", e));
        }
      } catch (e) {
        console.error("[Custom Server ASR] Exception while trying to close transcriber:", e);
      }
    };

    transcriber.on('open', ({ sessionId }) => {
      console.log(`[Custom Server ASR] AssemblyAI session opened: ${sessionId}`);
      isAssemblyAIReady = true;
      safeSendToClient({ type: 'ASSEMBLYAI_SESSION_OPENED', sessionId });
      // Process any queued audio
      processQueuedAudio();
    });

    transcriber.on('transcript', (transcript) => {
      safeSendToClient({ type: 'ASSEMBLYAI_TRANSCRIPT', transcript });
    });

    transcriber.on('error', (error) => {
      console.error('[Custom Server ASR] AssemblyAI Error:', error);
      safeSendToClient({ type: 'ASSEMBLYAI_ERROR', error: { message: error.message || 'Unknown AssemblyAI error' } });
    });

    transcriber.on('close', (code, reason) => {
      console.log(`[Custom Server ASR] AssemblyAI session closed: ${code}, ${reason}`);
      isAssemblyAIReady = false;
      safeSendToClient({ type: 'ASSEMBLYAI_SESSION_CLOSED', code, reason });
      // Also send session terminated when AssemblyAI closes
      safeSendToClient({ type: 'SESSION_TERMINATED_BY_SERVER' });
    });

    transcriber.connect().catch((err) => {
      console.error("[Custom Server ASR] Failed to connect to AssemblyAI:", err);
      safeSendToClient({ type: 'ASSEMBLYAI_CONNECTION_FAILED', error: { message: err.message || 'Failed to connect to AssemblyAI service' } });
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.close(1011, 'AssemblyAI connection failed'); } catch (e) { /* ignore */ }
      }
    });

    ws.on('message', (message) => {
      console.log(`[Custom Server ASR] Message received. Type: ${typeof message}, Is Buffer: ${Buffer.isBuffer(message)}`);
      if (Buffer.isBuffer(message)) {
        console.log(`[Custom Server ASR] Received audio buffer of length: ${message.length}`);
        if (isAssemblyAIReady && transcriber && typeof transcriber.sendAudio === 'function') {
          try {
            transcriber.sendAudio(message);
          } catch (e) {
            console.error('[Custom Server ASR] Error sending audio to AssemblyAI:', e);
          }
        } else {
          // Queue audio if AssemblyAI is not ready yet
          console.log('[Custom Server ASR] AssemblyAI not ready, queueing audio chunk');
          audioQueue.push(message);
        }
      } else if (typeof message === 'string') {
        console.log(`[Custom Server ASR] Received string message: ${message}`);
        try {
          const command = JSON.parse(message);
          if (command.action === 'endStream') {
            console.log('[Custom Server ASR] Client requested to end stream.');
            // Send session terminated message before closing
            safeSendToClient({ type: 'SESSION_TERMINATED_BY_SERVER' });
            safeCloseTranscriber();
          }
        } catch (e) {
          // Not a JSON command, could be other string data if any was expected
          console.warn('[Custom Server ASR] Received non-JSON string message (ignoring, not an endStream command):', message);
        }
      } else {
        console.warn(`[Custom Server ASR] Received message of unexpected type: ${typeof message}`);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[Custom Server ASR] Client disconnected: ${code} - ${reason ? reason.toString() : 'No reason'}`);
      safeCloseTranscriber();
    });

    ws.on('error', (error) => {
      console.error('[Custom Server ASR] Client WebSocket error:', error);
      safeCloseTranscriber();
    });
  });

  // Handle WebSocket upgrade requests specifically for our path
  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url, true);

    if (pathname === '/ws/asr') { // Our specific WebSocket path
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // For other paths (like /_next/webpack-hmr), let them be handled by Next.js or destroy the socket
      // For simplicity in this POC, we'll just destroy. A more robust server might have other handlers.
      console.log(`[Custom Server] Ignoring WebSocket upgrade for path: ${pathname}`);
      socket.destroy();
    }
  });

  httpServer
    .once('error', (err) => {
      console.error('HTTP server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});