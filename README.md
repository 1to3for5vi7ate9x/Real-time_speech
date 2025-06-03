# Real-Time Speech Translation and Video Dubbing POC

This is a [Next.js](https://nextjs.org/) project demonstrating a Proof of Concept (POC) for real-time speech-to-text (STT), translation, and text-to-speech (TTS) capabilities, along with video file processing for dubbed audio playback.

## Features

*   **Real-time Microphone Input:**
    *   Captures audio from the user's microphone.
    *   Streams audio to a backend for Speech-to-Text (ASR) processing (e.g., via AssemblyAI).
    *   Displays live transcription (partial and final).
    *   Translates final transcript segments in real-time to a selected target language.
    *   Allows playback of the translated audio for the last spoken segment using Text-to-Speech (TTS) via Cartesia.
*   **Video File Processing:**
    *   Allows users to upload a video file.
    *   Extracts audio from the video.
    *   Processes the entire audio content through the ASR service.
    *   Accumulates the full transcript from the video.
    *   Translates the complete transcript into the selected target language.
    *   Generates a complete dubbed audio track (TTS) for the full translation using Cartesia.
    *   Provides an option to play the original video (muted) synchronized with the generated dubbed audio track.
*   **Dynamic Language and Voice Selection:**
    *   Fetches available TTS voices (e.g., from Cartesia API).
    *   Allows users to select a target language for translation.
    *   Automatically selects an appropriate voice for the target language for TTS.

## Core Technologies Used

*   **Frontend:** Next.js (React)
*   **Speech-to-Text (ASR):** AssemblyAI (via a backend WebSocket proxy)
*   **Translation:** DeepL (via a backend API route)
*   **Text-to-Speech (TTS):** Cartesia (via a backend API route)
*   **Web Audio API:** For audio capture, processing, and playback.

## Project Structure

*   `src/app/page.tsx`: Main page component containing the core UI and client-side logic for audio processing, WebSocket communication, and state management.
*   `src/components/VideoPlayer.tsx`: Component for video file upload and playback (including dubbed audio).
*   `src/components/TranscriptionDisplay.tsx`: Component to display ASR transcripts.
*   `src/app/api/`: Contains Next.js API routes acting as backends-for-frontends (BFFs):
    *   `translate/route.ts`: Handles translation requests (e.g., to DeepL).
    *   `tts/route.ts`: Handles TTS requests (e.g., to Cartesia).
    *   `voices/route.ts`: Fetches available TTS voices (e.g., from Cartesia).
*   `server.js`: (Assumed) A Node.js WebSocket server that proxies ASR requests to a service like AssemblyAI and streams results back to the client. *(Details of this server are not fully managed by this assistant but are crucial for the ASR functionality).*

## Environment Variables

Create a `.env.local` file in the root of the project with the following variables:

```
NEXT_PUBLIC_ASSEMBLYAI_API_KEY="your_assemblyai_api_key_here"
# Replace with your actual AssemblyAI API key (if using client-side ASR initiation or if your backend needs it publicly)
# Or, if your server.js handles the API key securely, this might not be needed on the client-side.

CARTESIA_API_KEY="your_cartesia_api_key_here"
# Replace with your Cartesia API key for TTS. This is used by the backend /api/tts and /api/voices routes.

DEEPL_AUTH_KEY="your_deepl_auth_key_here"
# Replace with your DeepL API key (Free or Pro) for translation. This is used by the backend /api/translate route.

# Optional: If your ASR WebSocket server runs on a different URL
# NEXT_PUBLIC_WEBSOCKET_URL="ws://your-asr-websocket-server-url"
```

**Note:** Ensure that API keys with usage costs are properly secured and managed. For production, sensitive keys should ideally not be exposed on the client-side.

## Getting Started

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Set up your API Keys:**
    Create a `.env.local` file in the project root and add your API keys for AssemblyAI, Cartesia, and DeepL as shown above.
4.  **Run the development server (Next.js frontend):**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    This will typically start the frontend on [http://localhost:3000](http://localhost:3000).
5.  **Run the backend ASR WebSocket server:**
    Ensure your `server.js` (or equivalent WebSocket proxy for AssemblyAI) is running. The client expects this server to be available, typically at `ws://localhost:8000/ws/asr` if `NEXT_PUBLIC_WEBSOCKET_URL` is not set, or the URL specified.
    *(The setup for `server.js` is external to this Next.js project's direct build but is a required dependency for ASR.)*

6.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Microphone Input:
1.  User clicks "Start Recording".
2.  Audio is captured using the Web Audio API.
3.  PCM audio data is streamed via WebSocket to the backend ASR server (`server.js`).
4.  The ASR server (proxying to AssemblyAI) streams back partial and final transcripts.
5.  Partial transcripts update the UI for a live feel.
6.  Final transcript segments are sent to the `/api/translate` route.
7.  The translated text for segments is displayed.
8.  The user can click "Play Last Mic Translation" to send the last final translated segment to `/api/tts`, which streams back audio for playback.

### Video File Input:
1.  User uploads a video file via the `VideoPlayer` component.
2.  The client extracts the audio from the video using the Web Audio API (`decodeAudioData`).
3.  The extracted audio is chunked, resampled, and streamed to the backend ASR server.
4.  All `FinalTranscript` messages from the ASR are accumulated.
5.  Once the ASR service signals the end of the session for the video, the complete accumulated transcript is sent to the `/api/translate` route.
6.  The fully translated text is received and displayed.
7.  This full translation is then sent to the `/api/tts` route to generate a complete dubbed `AudioBuffer`.
8.  The user can click "Play with Dubbed Audio" in the `VideoPlayer` to play the original video (muted) alongside the dubbed audio.

## Further Development / TODOs

*   More robust error handling and user feedback.
*   UI/UX improvements (e.g., loading indicators for translation/TTS, better visualizers).
*   Investigate and optimize for lower latency in all stages.
*   Option to save/cache generated dubbed audio.
*   Support for more languages and voices.
*   Refine audio chunking and resampling for potentially better ASR accuracy.
*   Securely manage API keys, especially for production deployments.
*   Consider alternative methods for detecting ASR completion for videos if `SessionTerminated` is not reliably relayed.

---

This project is a Next.js application. Standard Next.js "Learn More" and "Deploy on Vercel" sections follow.

## Learn More (Next.js)

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel (Next.js)

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
