import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  transcript?: any;
  message?: string;
  error?: { message: string };
  sessionId?: string;
}

interface UseWebSocketProps {
  onTranscript: (transcript: any) => void;
  onSessionTerminated: () => void;
  onError: (error: string) => void;
}

export const useWebSocket = ({ onTranscript, onSessionTerminated, onError }: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbacksRef = useRef({ onTranscript, onSessionTerminated, onError });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = { onTranscript, onSessionTerminated, onError };
  }, [onTranscript, onSessionTerminated, onError]);

  useEffect(() => {
    const websocketUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3000/ws/asr';
    
    const connect = () => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        return;
      }

      ws.current = new WebSocket(websocketUrl);

      ws.current.onopen = () => {
        console.log(`WebSocket connected to ${websocketUrl}`);
        setIsConnected(true);
        setIsSessionReady(false);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.current.onmessage = (event) => {
        const rawMessage = event.data as string;
        console.log('Raw message from server:', rawMessage);
        
        try {
          if (rawMessage.startsWith('{') && rawMessage.endsWith('}')) {
            const message: WebSocketMessage = JSON.parse(rawMessage);
            console.log('Parsed JSON from server:', message);

            if (message.type === 'ASSEMBLYAI_TRANSCRIPT' && message.transcript) {
              callbacksRef.current.onTranscript(message.transcript);
            } else if (message.type === 'SESSION_TERMINATED_BY_SERVER') {
              callbacksRef.current.onSessionTerminated();
            } else if (message.type === 'ASSEMBLYAI_SESSION_OPENED') {
              console.log('AssemblyAI session opened:', message.sessionId);
              setIsSessionReady(true);
            } else if (message.type === 'ERROR' || message.type === 'ASSEMBLYAI_ERROR') {
              callbacksRef.current.onError(message.message || message.error?.message || 'Unknown error');
            }
          } else {
            console.log('Received plain text from server:', rawMessage);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error, 'Raw message was:', rawMessage);
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setIsSessionReady(false);
        
        // Attempt to reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          connect();
        }, 2000);
      };

      ws.current.onerror = (errorEvent) => {
        console.error('WebSocket error:', errorEvent);
        callbacksRef.current.onError('WebSocket connection error');
        setIsConnected(false);
        setIsSessionReady(false);
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const sendData = useCallback((data: ArrayBuffer | string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(data);
    }
  }, []);

  const endStream = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: "endStream" }));
    }
  }, []);

  return { isConnected, isSessionReady, sendData, endStream };
};