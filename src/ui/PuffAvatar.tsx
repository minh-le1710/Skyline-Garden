/** Bông: cục mây nhỏ có mầm lá trên đầu, vẽ bằng SVG (người dẫn đường, sau này là thú cưng). */
export function PuffAvatar({ size = 56, mood = 'happy' }: { size?: number; mood?: 'happy' | 'sleepy' }) {
  return (
    <svg class="puff-avatar" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M50 30 C48 20 50 14 53 10"
        stroke="#4a9e4e"
        stroke-width="4"
        fill="none"
        stroke-linecap="round"
      />
      <ellipse cx="62" cy="12" rx="10" ry="5" transform="rotate(-25 62 12)" fill="#7dd87a" />
      <ellipse cx="42" cy="15" rx="8" ry="4" transform="rotate(30 42 15)" fill="#5cbf60" />
      <g fill="#ffffff" stroke="#cfe0f5" stroke-width="2">
        <circle cx="30" cy="58" r="20" />
        <circle cx="70" cy="58" r="20" />
        <circle cx="50" cy="46" r="24" />
        <ellipse cx="50" cy="66" rx="34" ry="18" />
      </g>
      <ellipse cx="50" cy="62" rx="30" ry="15" fill="#ffffff" />
      {mood === 'sleepy' ? (
        <g stroke="#3c5a8a" stroke-width="3" stroke-linecap="round" fill="none">
          <path d="M36 56 q5 4 10 0" />
          <path d="M54 56 q5 4 10 0" />
        </g>
      ) : (
        <g fill="#3c5a8a">
          <circle cx="41" cy="55" r="4" />
          <circle cx="59" cy="55" r="4" />
        </g>
      )}
      <circle cx="33" cy="63" r="5" fill="#ffb3c7" opacity="0.7" />
      <circle cx="67" cy="63" r="5" fill="#ffb3c7" opacity="0.7" />
      <path d="M45 65 q5 5 10 0" stroke="#3c5a8a" stroke-width="2.5" fill="none" stroke-linecap="round" />
    </svg>
  );
}
