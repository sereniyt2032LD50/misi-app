import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { useState, useEffect, useCallback, useRef } from "react";

// Helper to check if the underlying WebSocket is truly OPEN before sending a query.
// This prevents the browser from throwing a native "CLOSING or CLOSED state" error.
function isSessionOpen(session: any): boolean {
  const ws = getSocket(session);
  if (ws) return ws.readyState === 1;
  return true; // Default to true if we can't definitively prove it's closed
}

function getSocket(session: any): WebSocket | null {
  if (!session) return null;
  try {
    if (session.conn instanceof WebSocket) return session.conn;
    if (session.ws instanceof WebSocket) return session.ws;
    if (session.client?.ws instanceof WebSocket) return session.client.ws;
    if (session._client?.ws instanceof WebSocket) return session._client.ws;
    if (session.liveClient?.ws instanceof WebSocket) return session.liveClient.ws;

    for (const key in session) {
      const val = session[key];
      if (val instanceof WebSocket) return val;
      if (typeof val === 'object' && val !== null) {
        for (const subKey in val) {
          if (val[subKey] instanceof WebSocket) return val[subKey];
        }
      }
    }
  } catch (e) {}
  return null;
}

const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

export function useGeminiLive(
  systemInstruction: string, 
  onAlert?: (type: string, message: string, severity: string) => void,
  onObservation?: (text: string, postureScore?: number, emotionalState?: string, alertStatus?: string) => void,
  onConsentGranted?: () => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const isConnectedRef = useRef<boolean>(false);
  const shouldReconnectRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const sessionHandleRef = useRef<string | null>(null);
  const onAlertRef = useRef(onAlert);
  const onObservationRef = useRef(onObservation);
  const onConsentGrantedRef = useRef(onConsentGranted);

  useEffect(() => {
    onAlertRef.current = onAlert;
    onObservationRef.current = onObservation;
    onConsentGrantedRef.current = onConsentGranted;
  }, [onAlert, onObservation, onConsentGranted]);

  const playAudioChunk = useCallback(async (base64Data: string) => {
    if (!audioContextRef.current) return;

    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768.0;
      }

      const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      };
      activeSourcesRef.current.push(source);

      const startTime = Math.max(audioContextRef.current.currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
    } catch (err) {
      console.error("Error playing audio chunk:", err);
    }
  }, []);

  const stopAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already stopped
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
  }, []);

  const connect = useCallback(() => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);
    setError(null);
    shouldReconnectRef.current = true;

    let apiKey = process.env.GEMINI_API_KEY;
    
    const startConnection = async () => {
      setError(null);
      try {
        if (!apiKey) {
          const res = await fetch('/api/config');
          const config = await res.json();
          apiKey = config.geminiApiKey;
        }

        if (!apiKey) {
          throw new Error("Gemini API Key is missing. Please check your environment variables.");
        }

        const ai = new GoogleGenAI({ apiKey });
        
        // Initialize output AudioContext on user gesture
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        const sessionPromise = ai.live.connect({
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            contextWindowCompression: { slidingWindow: {} },
            ...(sessionHandleRef.current ? { sessionResumption: { handle: sessionHandleRef.current } } : {}),
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "log_alert",
                    description: "Logs a safety or health alert based on visual or audio observation.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        type: {
                          type: Type.STRING,
                          description: "The type of alert: 'posture', 'fall', 'emotion', 'system', or 'observation'.",
                        },
                        message: {
                          type: Type.STRING,
                          description: "A descriptive message for the alert.",
                        },
                        severity: {
                          type: Type.STRING,
                          description: "The severity level: 'low', 'medium', or 'high'.",
                        },
                      },
                      required: ["type", "message", "severity"],
                    },
                  },
                  {
                    name: "log_observation",
                    description: "Logs a real-time observation of what the user is doing based on the video feed. Call this frequently to describe the user's posture, actions, and environment. You MUST also provide the current posture score (0-100), emotional state, and alert status.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        observation: {
                          type: Type.STRING,
                          description: "A detailed description of what is observed.",
                        },
                        postureScore: {
                          type: Type.NUMBER,
                          description: "The current posture score from 0 to 100. Starts at 0 and changes dynamically.",
                        },
                        emotionalState: {
                          type: Type.STRING,
                          description: "The current emotional state (e.g., 'Neutral', 'Calm', 'Stressed', 'Focused'). Starts at 'Neutral'.",
                        },
                        alertStatus: {
                          type: Type.STRING,
                          description: "The current alert status (e.g., 'Normal', 'Warning', 'Critical'). Starts at 'Normal'.",
                        }
                      },
                      required: ["observation", "postureScore", "emotionalState", "alertStatus"],
                    },
                  },
                  {
                    name: "start_monitoring_session",
                    description: "Activates the camera and begins the monitoring session. Call this ONLY AFTER the user has explicitly given verbal consent to be monitored."
                  },
                  {
                    name: "get_calendar_availability",
                    description: "Retrieves the user's free/busy availability from Google Calendar to help schedule recovery breaks."
                  },
                  {
                    name: "schedule_recovery_break",
                    description: "Schedules a recovery break on the Misi app's secondary calendar.",
                    parameters: { 
                      type: Type.OBJECT, 
                      properties: {
                        durationMinutes: { type: Type.NUMBER, description: "Duration of the break in minutes." }
                      },
                      required: ["durationMinutes"]
                    }
                  }
                ]
              },
            ],
          },
          callbacks: {
            onopen: async () => {
              if (!shouldReconnectRef.current) return;
              
              setIsConnected(true);
              isConnectedRef.current = true;
              setIsConnecting(false);
              
              // Delay resetting reconnect attempts to prevent rapid infinite loops if the connection drops immediately
              setTimeout(() => {
                if (isConnectedRef.current) {
                  reconnectAttemptsRef.current = 0;
                }
              }, 3000);
              
              console.log("Gemini Live connected");

              // Send an initial system message to prompt the greeting
              sessionPromise.then(session => {
                setTimeout(() => {
                  if (isSessionOpen(session)) {
                    try {
                      session.sendClientContent({
                        turns: [{ role: 'user', parts: [{ text: "System Event: The user has connected. Please introduce yourself as Misi, explain that you will monitor their posture and safety, and ask for their verbal consent to activate the camera and begin monitoring." }] }],
                        turnComplete: true
                      });
                    } catch (err) {
                      console.error("Failed to send initial greeting prompt:", err);
                    }
                  }
                }, 1000);
              });

              // Setup Microphone
              const setupMicrophone = async (retryCount = 0) => {
                try {
                  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  if (!isConnectedRef.current) {
                    mediaStream.getTracks().forEach(t => t.stop());
                    return;
                  }
                  micStreamRef.current = mediaStream;
                  const audioContext = new AudioContext({ sampleRate: 16000 });
                  micAudioContextRef.current = audioContext;
                  const source = audioContext.createMediaStreamSource(micStreamRef.current);
                  
                  await audioContext.audioWorklet.addModule('/audio-processor.js');
                  
                  if (!isConnectedRef.current || audioContext.state === 'closed') {
                    return;
                  }
                  
                  const processor = new AudioWorkletNode(audioContext, 'audio-processor');

                  processor.port.onmessage = (e) => {
                    if (!isConnectedRef.current) return;
                    
                    try {
                      const pcmData = e.data;
                      const uint8Array = new Uint8Array(pcmData.buffer);
                      let binary = '';
                      for (let i = 0; i < uint8Array.byteLength; i++) {
                        binary += String.fromCharCode(uint8Array[i]);
                      }
                      const base64Data = btoa(binary);

                      if (sessionRef.current && isSessionOpen(sessionRef.current)) {
                        try {
                          sessionRef.current.sendRealtimeInput({
                            media: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
                          });
                        } catch (err) {
                          // Ignore errors if the WebSocket is closing/closed
                        }
                      }
                    } catch (err) {
                      console.error("Failed to send audio data:", err);
                    }
                  };

                  source.connect(processor);
                  processor.connect(audioContext.destination);
                  processorRef.current = processor;
                } catch (err: any) {
                  console.error("Microphone access failed:", err);
                  if (isConnectedRef.current) {
                    if (err.name === 'NotReadableError') {
                      if (retryCount < 3) {
                        console.log(`Retrying microphone access (${retryCount + 1}/3)...`);
                        setTimeout(() => setupMicrophone(retryCount + 1), 1000);
                      } else {
                        setError("Microphone is in use by another application. Please close other apps and try again.");
                      }
                    } else if (err.name === 'NotAllowedError') {
                      setError("Microphone permission denied.");
                    } else {
                      setError("Could not start microphone.");
                    }
                  }
                }
              };
              
              setupMicrophone();
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                  if (part.inlineData?.data) {
                    try {
                      playAudioChunk(part.inlineData.data).catch(err => {
                        console.error("Error in playAudioChunk promise:", err);
                      });
                    } catch (err) {
                      console.error("Error playing audio chunk:", err);
                    }
                  }
                }
              }

              if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                console.log('User:', text);
              }
              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                console.log('Gemini:', text);
              }

              if (message.sessionResumptionUpdate) {
                if (message.sessionResumptionUpdate.resumable && message.sessionResumptionUpdate.newHandle) {
                  sessionHandleRef.current = message.sessionResumptionUpdate.newHandle;
                  console.debug('Stored new session resumption handle:', sessionHandleRef.current);
                }
              }

              if (message.goAway) {
                console.debug('Session GoAway received. Time left:', message.goAway.timeLeft);
              }

              if (message.serverContent?.generationComplete) {
                console.debug('Generation complete');
              }

              if (message.toolCall) {
                const functionResponses: any[] = [];
                for (const call of message.toolCall.functionCalls) {
                  if (call.name === "log_alert") {
                    const { type, message: alertMsg, severity } = call.args as any;
                    onAlertRef.current?.(type, alertMsg, severity);
                    functionResponses.push({
                      name: "log_alert",
                      id: call.id,
                      response: { status: "logged" },
                    });
                  } else if (call.name === "log_observation") {
                    const { observation, postureScore, emotionalState, alertStatus } = call.args as any;
                    onObservationRef.current?.(observation, postureScore, emotionalState, alertStatus);
                    functionResponses.push({
                      name: "log_observation",
                      id: call.id,
                      response: { status: "logged" },
                    });
                  } else if (call.name === "start_monitoring_session") {
                    onConsentGrantedRef.current?.();
                    functionResponses.push({
                      name: "start_monitoring_session",
                      id: call.id,
                      response: { status: "monitoring_started" },
                    });
                  } else if (call.name === "get_calendar_availability") {
                    try {
                      const res = await fetch("/api/calendar/availability", { method: 'POST', credentials: 'include' });
                      const data = await res.json();
                      if (res.ok) {
                        functionResponses.push({
                          name: call.name,
                          id: call.id,
                          response: { availability: data },
                        });
                      } else {
                        functionResponses.push({
                          name: call.name,
                          id: call.id,
                          response: { error: data.error || "Failed to fetch availability." },
                        });
                      }
                    } catch (e) {
                      functionResponses.push({
                        name: call.name,
                        id: call.id,
                        response: { error: "Network error fetching availability." },
                      });
                    }
                  } else if (call.name === "schedule_recovery_break") {
                    try {
                      const { durationMinutes } = call.args as any;
                      const res = await fetch("/api/calendar/schedule", { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ durationMinutes }),
                        credentials: 'include' 
                      });
                      const data = await res.json();
                      if (res.ok) {
                        functionResponses.push({
                          name: call.name,
                          id: call.id,
                          response: { status: "success", eventLink: data.eventLink },
                        });
                      } else {
                        functionResponses.push({
                          name: call.name,
                          id: call.id,
                          response: { error: data.error || "Failed to schedule break." },
                        });
                      }
                    } catch (e) {
                      functionResponses.push({
                        name: call.name,
                        id: call.id,
                        response: { error: "Network error scheduling break." },
                      });
                    }
                  } else {
                    functionResponses.push({
                      name: call.name,
                      id: call.id,
                      response: { error: "Tool not implemented." },
                    });
                  }
                }
                
                if (functionResponses.length > 0) {
                  sessionPromise.then(session => {
                    if (!isSessionOpen(session)) return;
                    try {
                      session.sendToolResponse({ functionResponses });
                    } catch (err) {}
                  });
                }
              }
              
              if (message.serverContent?.interrupted) {
                stopAudio();
              }
            },
            onclose: () => {
              setIsConnected(false);
              isConnectedRef.current = false;
              if (!shouldReconnectRef.current) {
                setIsConnecting(false);
              }
              if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
              }
              if (processorRef.current) {
                try {
                  processorRef.current.port.onmessage = null;
                  processorRef.current.port.close();
                  processorRef.current.disconnect();
                } catch (e) {}
                processorRef.current = null;
              }
              if (micAudioContextRef.current) {
                try {
                  micAudioContextRef.current.close();
                } catch (e) {}
                micAudioContextRef.current = null;
              }
              console.log("Gemini Live closed");
              
              if (shouldReconnectRef.current) {
                if (reconnectAttemptsRef.current >= 5) {
                  console.error("Max reconnect attempts reached. Stopping reconnection.");
                  setError("Connection lost. Please try reconnecting manually.");
                  setIsConnecting(false);
                  shouldReconnectRef.current = false;
                  return;
                }
                
                const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
                console.log(`Unexpected disconnect, attempting to reconnect in ${backoffTime}ms...`);
                reconnectAttemptsRef.current += 1;
                
                setTimeout(() => {
                  if (shouldReconnectRef.current) {
                    startConnection();
                  }
                }, backoffTime);
              }
            },
            onerror: (err) => {
              console.error("Gemini Live error:", err);
              // Do not set shouldReconnectRef.current = false here, 
              // so that onclose can attempt to reconnect if it was a network drop.
              setError(err.message || "Connection error occurred.");
            },
          },
        });

        sessionRef.current = await sessionPromise;
        
        // If the user disconnected while we were waiting for the promise to resolve
        if (!shouldReconnectRef.current && sessionRef.current) {
          sessionRef.current.close();
          sessionRef.current = null;
        }

      } catch (err: any) {
        console.error("Connection error in useGeminiLive:", err);
        setError(err.message);
        setIsConnecting(false);
        alert(`Failed to connect to Gemini: ${err.message}\n\nPlease check your GEMINI_API_KEY in Cloud Run.`);
      }
    };

    startConnection();
  }, [isConnected, isConnecting, systemInstruction]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    isConnectedRef.current = false;
    shouldReconnectRef.current = false;
    
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.port.onmessage = null;
        processorRef.current.port.close();
        processorRef.current.disconnect();
      } catch (e) {
        console.error("Error disconnecting processor:", e);
      }
      processorRef.current = null;
    }
    if (micAudioContextRef.current) {
      try {
        micAudioContextRef.current.close();
      } catch (e) {
        console.error("Error closing mic audio context:", e);
      }
      micAudioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const sendMedia = useCallback((data: string, mimeType: string) => {
    if (sessionRef.current && isConnectedRef.current && isSessionOpen(sessionRef.current)) {
      try {
        sessionRef.current.sendRealtimeInput({
          video: { data, mimeType },
        });
      } catch (err) {
        console.error("Failed to send media:", err);
      }
    }
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (sessionRef.current && isConnectedRef.current && isSessionOpen(sessionRef.current)) {
      try {
        sessionRef.current.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
      } catch (err) {
        console.error("Failed to send text message:", err);
      }
    }
  }, []);

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMedia,
    sendMessage,
    error,
  };
}
