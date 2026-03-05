// root/src/components/ApplicationCard.tsx
import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Lock, VideoOff } from "lucide-react";

interface ApplicationCardProps {
  title: string;
  description: string;
  link: string;

  // preferred preview
  videoSrc?: string;

  // image fallback (NEW)
  imageSrc?: string;

  // legacy: previously used as "thumbnail" (sometimes video URL). We now support:
  // - if it's a video URL => treated as video
  // - otherwise => treated as image fallback
  thumbnail?: string;

  disabled?: boolean;
}

const isVideo = (src?: string) =>
  !!src && /\.(mp4|webm|ogg)(\?.*)?$/i.test(src);

export function ApplicationCard(props: ApplicationCardProps) {
  const { title, description, link, disabled } = props;

  // Back-compat: allow thumbnail if it's actually a video
  const derivedVideo =
    !props.videoSrc && isVideo(props.thumbnail) ? props.thumbnail : undefined;

  const videoSrc = props.videoSrc || derivedVideo;

  // Image fallback:
  // 1) explicit imageSrc wins
  // 2) else if thumbnail exists and is NOT a video, treat it as image
  const imageSrc =
    props.imageSrc || (!isVideo(props.thumbnail) ? props.thumbnail : undefined);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const [videoReady, setVideoReady] = React.useState(false);
  const [videoFailed, setVideoFailed] = React.useState(false);

  const [imageReady, setImageReady] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);

  const handleOpenApplication = () => {
    if (disabled) return;
    try {
      window.open(link, "_blank", "noopener,noreferrer");
    } catch {
      // never throw if popup blocked or window.open fails
    }
  };

  // Reset image state when image changes
  React.useEffect(() => {
    setImageReady(false);
    setImageFailed(false);
  }, [imageSrc]);

  // Try autoplay video if present (but do NOT mark as failed if autoplay is blocked)
  React.useEffect(() => {
    if (!videoSrc || !videoRef.current) return;

    const el = videoRef.current;
    setVideoReady(false);
    setVideoFailed(false);

    const tryPlay = async () => {
      try {
        const p = el.play();
        if (p && typeof (p as Promise<void>).then === "function") await p;
      } catch (err: any) {
        // Autoplay may be blocked (NotAllowedError) — don't treat as failure.
        // But if the browser says it can't play it, then fall back to image.
        const name = String(err?.name || "");
        if (name && name !== "NotAllowedError" && name !== "AbortError") {
          setVideoFailed(true);
        }
      }
    };


    tryPlay();
  }, [videoSrc]);

  // Priority logic
  // Priority logic:
  // Video (only when ready) -> Image -> Unavailable
  const canAttemptVideo = !!videoSrc && !videoFailed;
  const canAttemptImage = !!imageSrc && !imageFailed;

  const showVideo = canAttemptVideo && videoReady; // only show video once it can actually render
  const showImage = !showVideo && canAttemptImage; // show image if video isn't ready/failed/absent
  const showUnavailable = !canAttemptVideo && !canAttemptImage;

  return (
    <Card
      className={[
        "group relative overflow-hidden p-6 glass transition-all duration-300 animate-scale-in",
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:scale-[1.02] cursor-pointer",
      ].join(" ")}
      onClick={handleOpenApplication}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleOpenApplication();
      }}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label={disabled ? `${title} locked` : `Open ${title}`}
    >
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>

          {disabled && (
            <div className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
              <Lock className="h-3 w-3" />
              Locked
            </div>
          )}
        </div>

        {/* Preview: Video -> Image -> Unavailable */}
        <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-lg">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-muted/40 to-muted/10" />

          {showUnavailable && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                <VideoOff className="h-4 w-4" />
                Preview unavailable
              </div>
            </div>
          )}

{canAttemptImage && (
            <img
              src={imageSrc}
              alt={`${title} preview image`}
              loading="lazy"
              onLoad={() => setImageReady(true)}
              onError={() => setImageFailed(true)}
              className={[
                "absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-105 pointer-events-none",
                "transition-opacity duration-500",
                showVideo ? "opacity-0" : imageReady ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          )}


{canAttemptVideo && (
            <video
              ref={videoRef}
              src={videoSrc}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              aria-label={`${title} preview video`}
              onCanPlay={() => setVideoReady(true)}
              onLoadedData={() => setVideoReady(true)}
              onError={() => setVideoFailed(true)}
              className={[
                "absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-105 pointer-events-none",
                "transition-opacity duration-500",
                showVideo ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          )}

        </div>

        <div className="mt-auto pt-4">
          <Button
            className="gap-2"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenApplication();
            }}
          >
            {disabled ? "Access Disabled" : "Open Application"}
            {!disabled && <ArrowUpRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}
