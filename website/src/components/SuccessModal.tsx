"use client";

interface SuccessModalProps {
  open: boolean;
  waLink: string;
  onClose: () => void;
}

export default function SuccessModal({ open, waLink, onClose }: SuccessModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-surface-light p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-4xl">
          ✓
        </div>
        <h3 className="mt-5 text-2xl font-bold">You&apos;re all set!</h3>
        <p className="mt-3 text-gray-400">
          Your account is ready. Tap the button below to open WhatsApp and start
          chatting with your AI assistant.
        </p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-full bg-green-600 px-8 py-3.5 text-lg font-semibold transition hover:bg-green-700"
        >
          Try It Now on WhatsApp
        </a>
        <button
          onClick={onClose}
          className="mt-4 block w-full text-sm text-gray-500 transition hover:text-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
