import { useCallback, useEffect, useState } from "react";

const IMAGE_KEY = "mitto_custom_background_image";
const OPACITY_KEY = "mitto_custom_background_opacity";
const EVENT_NAME = "mitto:custom-background";
const DEFAULT_OPACITY = 0.32;
const MAX_IMAGE_DATA_LENGTH = 2_100_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+=*$/;

function isSupportedImageDataUrl(value: string) {
  return value.length <= MAX_IMAGE_DATA_LENGTH && IMAGE_DATA_URL_PATTERN.test(value);
}

function readOpacity() {
  if (typeof window === "undefined") return DEFAULT_OPACITY;
  try {
    const value = Number(window.localStorage.getItem(OPACITY_KEY));
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_OPACITY;
  } catch {
    return DEFAULT_OPACITY;
  }
}

function readImage() {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(IMAGE_KEY) || "";
    if (!value || isSupportedImageDataUrl(value)) return value;
    window.localStorage.removeItem(IMAGE_KEY);
  } catch {
    // Private browsing or disabled storage should not prevent the dashboard rendering.
  }
  return "";
}

/** Persists a user-selected background without creating object-URL leaks. */
export function useCustomBackground() {
  const [image, setImage] = useState(readImage);
  const [opacity, setOpacityState] = useState(readOpacity);
  const [opacityPersistenceFailed, setOpacityPersistenceFailed] = useState(false);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ image?: string; opacity?: number }>).detail;
      if (typeof detail?.image === "string" && (!detail.image || isSupportedImageDataUrl(detail.image))) {
        setImage(detail.image);
      }
      if (typeof detail?.opacity === "number") setOpacityState(Math.min(1, Math.max(0, detail.opacity)));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === IMAGE_KEY) {
        const nextImage = event.newValue || "";
        if (!nextImage || isSupportedImageDataUrl(nextImage)) setImage(nextImage);
      }
      if (event.key === OPACITY_KEY) {
        const next = Number(event.newValue);
        if (Number.isFinite(next)) setOpacityState(Math.min(1, Math.max(0, next)));
      }
    };

    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setBackgroundImage = useCallback((next: string) => {
    if (next && !isSupportedImageDataUrl(next)) return false;
    try {
      if (next) window.localStorage.setItem(IMAGE_KEY, next);
      else window.localStorage.removeItem(IMAGE_KEY);
      setImage(next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { image: next, opacity } }));
      return true;
    } catch {
      return false;
    }
  }, [opacity]);

  const setOpacity = useCallback((next: number) => {
    const value = Math.min(1, Math.max(0, next));
    try {
      window.localStorage.setItem(OPACITY_KEY, String(value));
      setOpacityPersistenceFailed(false);
    } catch {
      // Keep the live preview working even if storage is unavailable.
      setOpacityPersistenceFailed(true);
    }
    setOpacityState(value);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { image, opacity: value } }));
  }, [image]);

  return {
    backgroundImage: image,
    backgroundOpacity: opacity,
    opacityPersistenceFailed,
    setBackgroundImage,
    setOpacity,
  };
}
