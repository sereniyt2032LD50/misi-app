import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface CameraViewProps {
  onFrame: (base64Data: string) => void;
  isActive: boolean;
  onError?: (error: string) => void;
  fps?: number;
  quality?: number;
}

export function CameraView({ onFrame, isActive, onError, fps = 0.2, quality = 0.2 }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPiP, setIsPiP] = useState(false);
  const onFrameRef = useRef(onFrame);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const togglePiP = async () => {
    try {
      if (!videoRef.current) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (error) {
      console.error("PiP failed", error);
    }
  };

  useEffect(() => {
    const handlePiPExit = () => setIsPiP(false);
    const video = videoRef.current;
    if (video) {
      video.addEventListener('leavepictureinpicture', handlePiPExit);
    }
    return () => {
      if (video) {
        video.removeEventListener('leavepictureinpicture', handlePiPExit);
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      setError(null);
      return;
    }

    let isMounted = true;
    let stream: MediaStream | null = null;
    let intervalId: any = null;

    const startCamera = async (retryCount = 0) => {
      try {
        setError(null);
        
        // On retry, relax constraints to maximize chance of success
        const constraints = retryCount > 0 ? { video: true } : {
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            facingMode: "user"
          },
        };
        
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!isMounted) {
          // If component unmounted while waiting for camera, stop it immediately
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Wait for video to be ready before capturing frames
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = resolve;
          } else {
            resolve(null);
          }
        });

        const captureFrame = () => {
          if (videoRef.current && canvasRef.current && isMounted) {
            const context = canvasRef.current.getContext("2d");
            if (context) {
              // Draw current frame to canvas
              context.drawImage(videoRef.current, 0, 0, 160, 120);
              
              // Convert to JPEG using asynchronous toBlob for better performance
              canvasRef.current.toBlob(
                (blob) => {
                  if (!blob || !isMounted) return;

                  const reader = new FileReader();
                  reader.onloadend = () => {
                    if (!isMounted) return;
                    const base64 = (reader.result as string).split(",")[1];
                    onFrameRef.current(base64);
                  };
                  reader.readAsDataURL(blob);
                },
                "image/jpeg",
                quality
              );
            }
          }
        };

        // Start interval based on configured FPS
        intervalId = setInterval(captureFrame, 1000 / fps);
      } catch (err: any) {
        console.error("Error accessing camera:", err);
        if (isMounted) {
          if (err.name === 'NotReadableError') {
            if (retryCount < 3) {
              console.log(`Retrying camera access (${retryCount + 1}/3)...`);
              setTimeout(() => startCamera(retryCount + 1), 1000);
            } else {
              setError("Camera is in use by another application. Please close other apps and try again.");
            }
          } else if (err.name === 'NotAllowedError') {
            setError("Camera permission denied.");
          } else {
            setError("Could not start camera.");
          }
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isActive, fps, quality]);

  return (
    <div className="relative w-full aspect-video bg-zinc-50 dark:bg-black rounded-2xl overflow-hidden border border-black/20 dark:border-white/10 shadow-2xl flex items-center justify-center">
      {error ? (
        <div className="text-red-400 text-sm flex flex-col items-center gap-2 p-4 text-center">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-lg">!</span>
          </div>
          <p>{error}</p>
          <p className="text-xs text-zinc-700 dark:text-white/50">Please close other apps using the camera and try again.</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      )}
      <canvas ref={canvasRef} width={160} height={120} className="hidden" />
      <div className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border ${isActive && !error ? 'bg-emerald-500 border-emerald-500' : 'bg-white/40 dark:bg-black/40 border-black/20 dark:border-white/10'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${isActive && !error ? 'bg-white animate-pulse' : 'bg-zinc-500'}`} />
        <span className={`text-[10px] uppercase tracking-widest font-mono ${isActive && !error ? 'text-zinc-900 dark:text-white font-semibold' : 'text-zinc-700 dark:text-white/50'}`}>Live Feed</span>
      </div>
      
      {isActive && !error && (
        <button 
          onClick={togglePiP}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/40 dark:bg-black/40 backdrop-blur-md border border-black/20 dark:border-white/10 text-zinc-700 dark:text-white/60 hover:text-zinc-900 dark:text-white hover:bg-white/60 dark:bg-black/60 transition-all"
          title="Toggle Picture-in-Picture"
        >
          {isPiP ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}
