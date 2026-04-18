export function LogoIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M72 30 C72 18, 50 18, 40 28 C30 38, 42 44, 58 50 C74 56, 80 66, 70 76 C60 86, 40 86, 28 76"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ iconSize = 28, className = "" }: { iconSize?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-heading ${className}`}>
      <LogoIcon size={iconSize} />
      <span className="text-xl font-bold tracking-tight">Swayat AI</span>
    </span>
  );
}
