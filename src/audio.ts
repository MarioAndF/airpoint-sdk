type AudioGroup = "sfx" | "music";

type AudioMap = Record<string, string>;

type AudioRegisterOptions = {
  sfx?: AudioMap;
  music?: AudioMap;
  baseUrl?: string;
};

type AudioPlayOptions = {
  volume?: number;
  rate?: number;
  loop?: boolean;
  fadeMs?: number;
};

type AudioState = {
  muted: boolean;
  masterVolume: number;
  groupVolumes: Record<AudioGroup, number>;
};

type AudioController = {
  register(options: AudioRegisterOptions): void;
  preload(options?: { sfx?: string[]; music?: string[] }): Promise<void>;
  setMasterVolume(volume: number): void;
  setGroupVolume(group: AudioGroup, volume: number): void;
  setMuted(muted: boolean): void;
  getState(): AudioState;
  sfx: {
    play(id: string, options?: AudioPlayOptions): HTMLAudioElement | null;
  };
  music: {
    play(id: string, options?: AudioPlayOptions): HTMLAudioElement | null;
    stop(): void;
    pause(): void;
    resume(): void;
  };
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const resolveUrl = (baseUrl: string | undefined, url: string) => {
  if (!baseUrl) return url;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/")
  ) {
    return url;
  }
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}/${url}`;
};

const safeAudio = (url: string) => {
  if (typeof window === "undefined") {
    return null;
  }
  return new Audio(url);
};

const loadAudioElement = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const el = safeAudio(url);
    if (!el) {
      resolve();
      return;
    }
    const cleanup = () => {
      el.removeEventListener("canplaythrough", onReady);
      el.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load audio: ${url}`));
    };
    el.addEventListener("canplaythrough", onReady, { once: true });
    el.addEventListener("error", onError, { once: true });
    el.preload = "auto";
    el.load();
  });

const getAudioContext = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  return new Ctx();
};

export const createAudioController = (): AudioController => {
  const registry = {
    sfx: {} as AudioMap,
    music: {} as AudioMap,
  };

  const state: AudioState = {
    muted: false,
    masterVolume: 1,
    groupVolumes: {
      sfx: 1,
      music: 1,
    },
  };

  let baseUrl: string | undefined;
  let currentMusic: HTMLAudioElement | null = null;
  let currentMusicBaseVolume = 1;
  let currentMusicId: string | null = null;
  let audioContext: AudioContext | null = null;
  let webMusicState: {
    id: string;
    buffer: AudioBuffer;
    source: AudioBufferSourceNode | null;
    gain: GainNode;
    startTime: number;
    offset: number;
    loop: boolean;
    baseVolume: number;
  } | null = null;

  const bufferCache = {
    sfx: new Map<string, AudioBuffer>(),
    music: new Map<string, AudioBuffer>(),
  };
  const bufferPromises = new Map<string, Promise<AudioBuffer>>();

  const ensureAudioContext = () => {
    if (audioContext) return audioContext;
    audioContext = getAudioContext();
    return audioContext;
  };

  const getUrl = (group: AudioGroup, id: string) => {
    const url = registry[group][id];
    return url ? resolveUrl(baseUrl, url) : null;
  };

  const applyVolume = (group: AudioGroup, baseVolume = 1) => {
    if (state.muted) return 0;
    return clamp01(baseVolume) * state.masterVolume * state.groupVolumes[group];
  };

  const ensureBuffer = async (group: AudioGroup, id: string, url: string) => {
    const cached = bufferCache[group].get(id);
    if (cached) {
      return cached;
    }

    const ctx = ensureAudioContext();
    if (!ctx) {
      return null;
    }

    const key = `${group}:${id}`;
    const existing = bufferPromises.get(key);
    if (existing) {
      return existing;
    }

    const promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        bufferCache[group].set(id, buffer);
        bufferPromises.delete(key);
        return buffer;
      })
      .catch((error) => {
        bufferPromises.delete(key);
        throw error;
      });

    bufferPromises.set(key, promise);
    return promise;
  };

  const useWebAudio = () => Boolean(ensureAudioContext());

  const fadeVolume = (
    el: HTMLAudioElement,
    from: number,
    to: number,
    ms: number,
  ) => {
    if (ms <= 0) {
      el.volume = clamp01(to);
      return;
    }
    const start = performance.now();
    const delta = to - from;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / ms);
      el.volume = clamp01(from + delta * progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  };

  const updateWebMusicGain = (volume: number, fadeMs = 0) => {
    if (!webMusicState) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const gainParam = webMusicState.gain.gain;
    const now = ctx.currentTime;
    gainParam.cancelScheduledValues(now);
    if (fadeMs <= 0) {
      gainParam.setValueAtTime(clamp01(volume), now);
      return;
    }
    gainParam.setValueAtTime(gainParam.value, now);
    gainParam.linearRampToValueAtTime(clamp01(volume), now + fadeMs / 1000);
  };

  const stopWebMusic = (fadeMs = 0) => {
    if (!webMusicState) return;
    const ctx = ensureAudioContext();
    if (!ctx) {
      webMusicState = null;
      return;
    }
    if (fadeMs > 0) {
      updateWebMusicGain(0, fadeMs);
      setTimeout(() => {
        webMusicState?.source?.stop();
        webMusicState = null;
      }, fadeMs);
      return;
    }
    webMusicState.source?.stop();
    webMusicState = null;
  };

  const pauseWebMusic = () => {
    if (!webMusicState) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (!webMusicState.source) return;
    const elapsed = ctx.currentTime - webMusicState.startTime;
    const duration = webMusicState.buffer.duration || 0;
    const nextOffset =
      duration > 0 ? (webMusicState.offset + elapsed) % duration : 0;
    webMusicState.offset = nextOffset;
    webMusicState.source.stop();
    webMusicState.source = null;
  };

  const resumeWebMusic = () => {
    if (!webMusicState || state.muted) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const source = ctx.createBufferSource();
    source.buffer = webMusicState.buffer;
    source.loop = webMusicState.loop;
    source.connect(webMusicState.gain);
    webMusicState.startTime = ctx.currentTime;
    webMusicState.source = source;
    source.start(ctx.currentTime, webMusicState.offset);
  };

  return {
    register(options) {
      if (options.baseUrl !== undefined) {
        baseUrl = options.baseUrl;
      }
      if (options.sfx) {
        registry.sfx = { ...registry.sfx, ...options.sfx };
      }
      if (options.music) {
        registry.music = { ...registry.music, ...options.music };
      }
    },
    async preload(options) {
      const sfxIds = options?.sfx ?? Object.keys(registry.sfx);
      const musicIds = options?.music ?? Object.keys(registry.music);
      const urls = [
        ...sfxIds.map((id) => getUrl("sfx", id)),
        ...musicIds.map((id) => getUrl("music", id)),
      ].filter((url): url is string => Boolean(url));
      if (useWebAudio()) {
        await Promise.all([
          ...sfxIds.map((id) => {
            const url = getUrl("sfx", id);
            return url ? ensureBuffer("sfx", id, url) : Promise.resolve(null);
          }),
          ...musicIds.map((id) => {
            const url = getUrl("music", id);
            return url ? ensureBuffer("music", id, url) : Promise.resolve(null);
          }),
        ]);
        return;
      }

      await Promise.all(urls.map((url) => loadAudioElement(url)));
    },
    setMasterVolume(volume) {
      state.masterVolume = clamp01(volume);
      if (currentMusic) {
        currentMusic.volume = applyVolume("music", currentMusicBaseVolume);
      }
      if (webMusicState) {
        updateWebMusicGain(applyVolume("music", webMusicState.baseVolume));
      }
    },
    setGroupVolume(group, volume) {
      state.groupVolumes[group] = clamp01(volume);
      if (group === "music" && currentMusic) {
        currentMusic.volume = applyVolume("music", currentMusicBaseVolume);
      }
      if (group === "music" && webMusicState) {
        updateWebMusicGain(applyVolume("music", webMusicState.baseVolume));
      }
    },
    setMuted(muted) {
      state.muted = muted;
      if (currentMusic) {
        currentMusic.volume = applyVolume("music", currentMusicBaseVolume);
        if (muted) {
          currentMusic.pause();
        }
      }
      if (webMusicState) {
        updateWebMusicGain(applyVolume("music", webMusicState.baseVolume));
      }
    },
    getState() {
      return {
        muted: state.muted,
        masterVolume: state.masterVolume,
        groupVolumes: { ...state.groupVolumes },
      };
    },
    sfx: {
      play(id, options) {
        const url = getUrl("sfx", id);
        if (!url) return null;
        if (useWebAudio()) {
          const ctx = ensureAudioContext();
          const buffer = bufferCache.sfx.get(id) ?? null;
          if (ctx && buffer) {
            if (ctx.state === "suspended") {
              void ctx.resume();
            }
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            source.loop = options?.loop ?? false;
            source.playbackRate.value = options?.rate ?? 1;
            gain.gain.value = applyVolume("sfx", options?.volume ?? 1);
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start();
            return null;
          }
          void ensureBuffer("sfx", id, url).catch(() => undefined);
        }

        const el = safeAudio(url);
        if (!el) return null;
        el.preload = "auto";
        el.loop = options?.loop ?? false;
        el.playbackRate = options?.rate ?? 1;
        el.volume = applyVolume("sfx", options?.volume ?? 1);
        void el.play();
        return el;
      },
    },
    music: {
      play(id, options) {
        const url = getUrl("music", id);
        if (!url) return null;
        const loop = options?.loop ?? true;
        const baseVolume = options?.volume ?? 1;

        if (useWebAudio()) {
          const ctx = ensureAudioContext();
          const buffer = bufferCache.music.get(id) ?? null;
          if (ctx && buffer) {
            if (webMusicState?.id === id && webMusicState.source) {
              return null;
            }

            if (webMusicState?.id === id && !webMusicState.source) {
              webMusicState.baseVolume = baseVolume;
              webMusicState.loop = loop;
              updateWebMusicGain(applyVolume("music", baseVolume));
              resumeWebMusic();
              return null;
            }

            stopWebMusic(options?.fadeMs ?? 0);
            if (ctx.state === "suspended") {
              void ctx.resume();
            }
            const gain = ctx.createGain();
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = loop;
            source.connect(gain);
            gain.connect(ctx.destination);
            const targetVolume = applyVolume("music", baseVolume);
            gain.gain.value = options?.fadeMs ? 0 : targetVolume;
            source.start(ctx.currentTime, 0);
            webMusicState = {
              id,
              buffer,
              source,
              gain,
              startTime: ctx.currentTime,
              offset: 0,
              loop,
              baseVolume,
            };
            if (options?.fadeMs) {
              updateWebMusicGain(targetVolume, options.fadeMs);
            }
            currentMusicId = id;
            currentMusic = null;
            currentMusicBaseVolume = baseVolume;
            return null;
          }
          void ensureBuffer("music", id, url).catch(() => undefined);
        }

        if (currentMusicId === id && currentMusic) {
          return currentMusic;
        }

        if (currentMusic) {
          const prev = currentMusic;
          currentMusic = null;
          if (options?.fadeMs) {
            fadeVolume(prev, prev.volume, 0, options.fadeMs);
            setTimeout(() => {
              prev.pause();
              prev.src = "";
            }, options.fadeMs);
          } else {
            prev.pause();
            prev.src = "";
          }
        }

        const el = safeAudio(url);
        if (!el) return null;
        el.preload = "auto";
        el.loop = loop;
        currentMusicBaseVolume = baseVolume;
        const targetVolume = applyVolume("music", currentMusicBaseVolume);
        el.volume = options?.fadeMs ? 0 : targetVolume;
        void el.play();
        if (options?.fadeMs) {
          fadeVolume(el, 0, targetVolume, options.fadeMs);
        }
        currentMusic = el;
        currentMusicId = id;
        return el;
      },
      stop() {
        if (webMusicState) {
          stopWebMusic();
        }
        if (currentMusic) {
          currentMusic.pause();
          currentMusic.src = "";
          currentMusic = null;
        }
        currentMusicBaseVolume = 1;
        currentMusicId = null;
      },
      pause() {
        if (webMusicState) {
          pauseWebMusic();
          return;
        }
        currentMusic?.pause();
      },
      resume() {
        if (webMusicState) {
          resumeWebMusic();
          return;
        }
        if (!currentMusic || state.muted) return;
        void currentMusic.play();
      },
    },
  };
};

export const audio = createAudioController();
export type {
  AudioController,
  AudioRegisterOptions,
  AudioPlayOptions,
  AudioGroup,
};
