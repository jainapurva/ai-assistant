"use client";

interface SuccessModalProps {
  open: boolean;
  waLink: string;
  isPaid?: boolean;
  onClose: () => void;
}

export default function SuccessModal({ open, waLink, isPaid, onClose }: SuccessModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-4xl text-green-600">
          &#10003;
        </div>
        <h3 className="mt-5 text-2xl font-bold text-heading">You&apos;re all set!</h3>
        <p className="mt-3 text-body">
          {isPaid
            ? "Your free trial starts now \u2014 you won't be charged for 3 months. "
            : ""}
          Your account is ready. Tap the button below to open WhatsApp and start
          chatting with your AI assistant.
        </p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-full bg-green-600 px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-green-700"
        >
          Try It Now on WhatsApp
        </a>
        <button
          onClick={onClose}
          className="mt-4 block w-full text-sm text-muted transition hover:text-heading"
        >
          Close
        </button>
      </div>
    </div>
  );
}
