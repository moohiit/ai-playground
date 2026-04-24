"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type YoutubePlayerHandle = {
  seekTo: (seconds: number) => void;
};

type YTPlayer = {
  seekTo: (sec: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        target: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReadyPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return apiReadyPromise;
}

export const YoutubePlayer = forwardRef<
  YoutubePlayerHandle,
  { videoId: string }
>(function YoutubePlayer({ videoId }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    playerRef.current = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      const player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            playerRef.current = e.target;
            readyRef.current = true;
            if (pendingSeekRef.current !== null) {
              e.target.seekTo(pendingSeekRef.current, true);
              e.target.playVideo();
              pendingSeekRef.current = null;
            }
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
      readyRef.current = false;
    };
  }, [videoId]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (sec: number) => {
        if (readyRef.current && playerRef.current) {
          playerRef.current.seekTo(sec, true);
          playerRef.current.playVideo();
        } else {
          pendingSeekRef.current = sec;
        }
      },
    }),
    []
  );

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-zinc-800 bg-black">
      <div className="aspect-video w-full">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
});
