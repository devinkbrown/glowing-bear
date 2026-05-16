'use client';

import { useMemo } from 'react';

interface Props {
  url: string;
}

const YT_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/;
const VIDEO_EXT = /\.(mp4|webm|mov)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a)(\?.*)?$/i;

export default function MessageEmbed({ url }: Props) {
  const embed = useMemo(() => {
    const ytMatch = url.match(YT_RE);
    if (ytMatch) {
      return { type: 'youtube' as const, id: ytMatch[1] };
    }
    if (VIDEO_EXT.test(url)) {
      return { type: 'video' as const };
    }
    if (AUDIO_EXT.test(url)) {
      return { type: 'audio' as const };
    }
    return null;
  }, [url]);

  if (!embed) return null;

  if (embed.type === 'youtube') {
    return (
      <div className="mt-1 ml-[76px] max-w-[480px]">
        <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-black/30">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube-nocookie.com/embed/${embed.id}`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  if (embed.type === 'video') {
    return (
      <div className="mt-1 ml-[76px] max-w-[480px]">
        <video src={url} controls preload="metadata" className="rounded-lg w-full" />
      </div>
    );
  }

  if (embed.type === 'audio') {
    return (
      <div className="mt-1 ml-[76px] max-w-[400px]">
        <audio src={url} controls preload="metadata" className="w-full" />
      </div>
    );
  }

  return null;
}
