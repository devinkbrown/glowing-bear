// MessageEmbed — rich media embeds rendered below a message line, driven by
// extractEmbeds()' MediaEmbed union (youtube / twitch clip / twitch stream /
// direct video / direct audio).
//
// Iframe embeds are lazy: a click-to-load poster renders first so scrolling a
// busy channel never spawns hidden third-party players.

import { createSignal, Show, Switch, Match } from 'solid-js';
import type { MediaEmbed } from '@/lib/irc-classic/formatter';

export interface MessageEmbedProps {
  embed: MediaEmbed;
}

/** Indent to the desktop message-body column (ts 46+6 + nick 112+6). */
const EMBED_INDENT = 'mt-1 px-3 sm:px-0 sm:ml-[170px]';

interface LazyFrameProps {
  src: string;
  title: string;
  poster?: string;
  label?: string;
}

/** 16:9 click-to-load iframe shell with an optional poster image + label. */
function LazyFrame(props: LazyFrameProps) {
  const [loaded, setLoaded] = createSignal(false);

  return (
    <div class="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-black/30 border border-white/[0.05]">
      <Show
        when={loaded()}
        fallback={
          <button
            type="button"
            onClick={() => setLoaded(true)}
            class="absolute inset-0 w-full h-full group cursor-pointer"
            aria-label={`Load ${props.title}`}
          >
            <Show when={props.poster}>
              {(poster) => (
                <img src={poster()} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" />
              )}
            </Show>
            <span class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 group-hover:bg-black/45 transition-colors">
              <span class="w-12 h-12 rounded-full bg-black/60 border border-white/[0.2] flex items-center justify-center">
                <svg class="w-5 h-5 text-white translate-x-[1px]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M4 2.5v11l9-5.5-9-5.5z" />
                </svg>
              </span>
              <Show when={props.label}>
                <span class="text-[11px] text-gray-300 font-medium px-2 py-0.5 rounded bg-black/50">{props.label}</span>
              </Show>
            </span>
          </button>
        }
      >
        <iframe
          class="absolute inset-0 w-full h-full"
          src={props.src}
          title={props.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        />
      </Show>
    </div>
  );
}

export default function MessageEmbed(props: MessageEmbedProps) {
  const youtube = () => (props.embed.type === 'youtube' ? props.embed : undefined);
  const twitchClip = () => (props.embed.type === 'twitch_clip' ? props.embed : undefined);
  const twitchStream = () => (props.embed.type === 'twitch_stream' ? props.embed : undefined);
  const video = () => (props.embed.type === 'video' ? props.embed : undefined);
  const audio = () => (props.embed.type === 'audio' ? props.embed : undefined);

  return (
    <Switch>
      <Match when={youtube()}>
        {(e) => (
          <div class={`${EMBED_INDENT} max-w-[480px]`}>
            <LazyFrame
              title="YouTube video"
              poster={`https://i.ytimg.com/vi/${e().videoId}/hqdefault.jpg`}
              src={`https://www.youtube-nocookie.com/embed/${e().videoId}?autoplay=1${e().start > 0 ? `&start=${e().start}` : ''}`}
            />
          </div>
        )}
      </Match>

      <Match when={twitchClip()}>
        {(e) => (
          <div class={`${EMBED_INDENT} max-w-[480px]`}>
            <LazyFrame
              title="Twitch clip"
              label="Twitch clip"
              src={`https://clips.twitch.tv/embed?clip=${e().clipId}&parent=${location.hostname}&autoplay=true`}
            />
          </div>
        )}
      </Match>

      <Match when={twitchStream()}>
        {(e) => (
          <div class={`${EMBED_INDENT} max-w-[480px]`}>
            <LazyFrame
              title="Twitch stream"
              label={e().videoId ? 'Twitch video' : `twitch.tv/${e().channelId}`}
              src={
                e().videoId
                  ? `https://player.twitch.tv/?video=v${e().videoId}&parent=${location.hostname}&autoplay=true`
                  : `https://player.twitch.tv/?channel=${e().channelId}&parent=${location.hostname}&autoplay=true`
              }
            />
          </div>
        )}
      </Match>

      <Match when={video()}>
        {(e) => (
          <div class={`${EMBED_INDENT} max-w-[480px]`}>
            <video src={e().url} controls preload="metadata" class="rounded-lg w-full bg-black/30" />
          </div>
        )}
      </Match>

      <Match when={audio()}>
        {(e) => (
          <div class={`${EMBED_INDENT} max-w-[400px]`}>
            <audio src={e().url} controls preload="metadata" class="w-full" />
          </div>
        )}
      </Match>
    </Switch>
  );
}
