export function LogoIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#6366f1" />
      <path
        d="M21 11C21 7 13 7 11 11C9 15 23 17 21 21C19 25 11 25 11 21"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ iconSize = 28, className = "" }: { iconSize?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoIcon size={iconSize} />
      <span className="text-xl font-bold tracking-tight text-heading">
        Swayat AI
      </span>
    </span>
  );
}
