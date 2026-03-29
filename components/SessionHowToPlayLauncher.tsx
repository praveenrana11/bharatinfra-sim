"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import HowToPlayModal from "@/components/HowToPlayModal";
import {
  BHARATINFRA_ONBOARDING_STORAGE_KEY,
  HOW_TO_PLAY_OPEN_EVENT,
  HOW_TO_PLAY_SEEN_EVENT,
  HowToPlayOpenDetail,
} from "@/lib/howToPlay";

function isSessionPath(pathname: string | null) {
  return Boolean(pathname?.startsWith("/sessions/"));
}

export default function SessionHowToPlayLauncher() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [initialSlide, setInitialSlide] = useState(0);

  const showLauncher = isSessionPath(pathname);

  useEffect(() => {
    if (!showLauncher) {
      setIsOpen(false);
      setInitialSlide(0);
      return;
    }

    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<HowToPlayOpenDetail>).detail;
      setInitialSlide(detail?.slide ?? 0);
      setIsOpen(true);
    };

    window.addEventListener(HOW_TO_PLAY_OPEN_EVENT, handleOpen as EventListener);

    return () => {
      window.removeEventListener(HOW_TO_PLAY_OPEN_EVENT, handleOpen as EventListener);
    };
  }, [showLauncher]);

  if (!showLauncher) return null;

  function handleOpenFromButton() {
    setInitialSlide(0);
    setIsOpen(true);
  }

  function handleComplete() {
    localStorage.setItem(BHARATINFRA_ONBOARDING_STORAGE_KEY, "true");
    window.dispatchEvent(new Event(HOW_TO_PLAY_SEEN_EVENT));
    setIsOpen(false);
  }

  return (
    <>
      <HowToPlayModal
        open={isOpen}
        initialSlide={initialSlide}
        onClose={() => setIsOpen(false)}
        onComplete={handleComplete}
      />

      <button
        type="button"
        aria-label="Open how to play"
        onClick={handleOpenFromButton}
        className="fixed bottom-5 right-5 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-teal-300/25 bg-teal-500 text-2xl font-black text-white shadow-[0_18px_40px_rgba(20,184,166,0.35)] transition hover:-translate-y-0.5 hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/70"
      >
        ?
      </button>
    </>
  );
}
