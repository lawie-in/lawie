interface Props {
  /** 'light' = white text, for dark backgrounds (navbar)
   *  'dark'  = navy text, for light backgrounds (footer, login)  */
  variant?: 'light' | 'dark';
  className?: string;
}

export default function LawieLogoMark({ variant = 'dark', className }: Props) {
  const isLight = variant === 'light';
  const textColor = isLight ? '#FFFFFF' : '#0D1F3C';
  const taglineColor = isLight ? '#7BA7D4' : '#5A7A99';
  const accentColor = '#3B82C4'; // blue underline — same both ways

  return (
    // viewBox tightly crops just the logo mark, no background rect
    <svg
      viewBox="188 68 212 88"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Lawie — AI Legal Productivity"
    >
      <title>Lawie</title>

      {/* L — vertical stroke */}
      <rect x="190" y="72" width="3" height="56" fill={textColor} rx="1" />
      {/* L — horizontal foot */}
      <rect x="190" y="125" width="48" height="3" fill={textColor} rx="1" />

      {/* "awie" wordmark */}
      <text
        x="248"
        y="122"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="46"
        fill={textColor}
        fontWeight="400"
        letterSpacing="-1"
      >
        awie
      </text>

      {/* Blue accent underline */}
      <rect x="248" y="130" width="130" height="1.5" fill={accentColor} />

      {/* Tagline */}
      <text
        x="249"
        y="149"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="9.5"
        fill={taglineColor}
        letterSpacing="2.5"
      >
        AI LEGAL PRODUCTIVITY
      </text>
    </svg>
  );
}
