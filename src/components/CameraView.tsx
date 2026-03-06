import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface CameraViewProps {
  onFrame: (base64Data: string) => void;
  isActive: boolean;
}

export function CameraView({ onFrame, isActive }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPiP, setIsPiP] = useState(false);
  const onFrameRef = useRef(onFrame);

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
    if (!isActive) return;

    let stream: MediaStream | null = null;
    let intervalId: any = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        intervalId = setInterval(() => {
          if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext("2d");
            if (context) {
              context.drawImage(videoRef.current, 0, 0, 640, 480);
              const base64Data = canvasRef.current.toDataURL("image/jpeg", 0.5).split(",")[1];
              onFrameRef.current(base64Data);
            }
          }
        }, 1000); // Send frame every second
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isActive]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <canvas ref={canvasRef} width={640} height={480} className="hidden" />
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
        <span className="text-[10px] uppercase tracking-widest font-mono text-white/50">Live Feed</span>
      </div>
      
      {isActive && (
        <button 
          onClick={togglePiP}
          className="absolute top-4 right-4 p-2 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
          title="Toggle Picture-in-Picture"
        >
          {isPiP ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}
