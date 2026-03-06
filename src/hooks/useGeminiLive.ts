import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { useState, useEffect, useCallback, useRef } from "react";

const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

export function useGeminiLive(
  systemInstruction: string, 
  onAlert?: (type: string, message: string, severity: string) => void,
  onObservation?: (text: string) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Initialize output AudioContext on user gesture
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
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
                  description: "Logs a real-time observation of what the user is doing based on the video feed. Call this frequently to describe the user's posture, actions, and environment.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      observation: {
                        type: Type.STRING,
                        description: "A detailed description of what is observed.",
                      },
                    },
                    required: ["observation"],
                  },
                },
                {
                  name: "get_calendar_events",
                  description: "Retrieves upcoming events from the user's Google Calendar to help with scheduling and safety context.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "get_tasks",
                  description: "Retrieves the user's Google Tasks to help them stay organized during their session.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "get_doc_summary",
                  description: "Retrieves a summary or content from a Google Doc if the user is working on one.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      docId: { type: Type.STRING, description: "The ID of the Google Doc." }
                    },
                    required: ["docId"]
                  }
                }
              ],
            },
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            console.log("Gemini Live connected");
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  playAudioChunk(part.inlineData.data);
                }
              }
            }

            if (message.toolCall) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "log_alert") {
                  const { type, message: alertMsg, severity } = call.args as any;
                  onAlert?.(type, alertMsg, severity);
                  
                  sessionRef.current?.sendToolResponse({
                    functionResponses: [
                      {
                        name: "log_alert",
                        id: call.id,
                        response: { status: "logged" },
                      },
                    ],
                  });
                } else if (call.name === "log_observation") {
                  const { observation } = call.args as any;
                  onObservation?.(observation);
                  
                  sessionRef.current?.sendToolResponse({
                    functionResponses: [
                      {
                        name: "log_observation",
                        id: call.id,
                        response: { status: "logged" },
                      },
                    ],
                  });
                } else if (["get_calendar_events", "get_tasks", "get_doc_summary"].includes(call.name)) {
                  // These tools require the user to be connected. 
                  // For now, we return a message asking them to connect if they haven't.
                  sessionRef.current?.sendToolResponse({
                    functionResponses: [
                      {
                        name: call.name,
                        id: call.id,
                        response: { error: "Service not connected. Please ask the user to click 'Connect Google' in the sidebar." },
                      },
                    ],
                  });
                }
              }
            }
            
            if (message.serverContent?.interrupted) {
              stopAudio();
            }
          },
          onclose: () => {
            setIsConnected(false);
            setIsConnecting(false);
            console.log("Gemini Live closed");
          },
          onerror: (err) => {
            setError(err.message);
            setIsConnecting(false);
            console.error("Gemini Live error:", err);
          },
        },
      });

      sessionRef.current = session;

      // Setup Microphone
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(micStreamRef.current);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
          session.sendRealtimeInput({
            media: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
          });
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        processorRef.current = processor;
      } catch (err) {
        console.error("Microphone access failed:", err);
      }
    } catch (err: any) {
      setError(err.message);
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, systemInstruction, onAlert]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMedia = useCallback((data: string, mimeType: string) => {
    if (sessionRef.current && isConnected) {
      sessionRef.current.sendRealtimeInput({
        media: { data, mimeType },
      });
    }
  }, [isConnected]);

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

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMedia,
    error,
  };
}
