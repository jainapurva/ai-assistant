"use client";

import { useState, useEffect, useCallback } from "react";

export default function VideoModal({
  src,
  trigger,
}: {
  src: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </span>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="relative mx-4 max-h-[90vh] max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl font-bold transition"
              aria-label="Close video"
            >
              &times;
            </button>
            <div className="overflow-hidden rounded-2xl shadow-2xl bg-black">
              <video
                src={src}
                controls
                autoPlay
                playsInline
                className="w-full h-auto max-h-[85vh]"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
