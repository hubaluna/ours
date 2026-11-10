export function TogetherArt() {
  return (
    <svg
      className="together-art"
      viewBox="0 0 320 245"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="a"
          x1="100"
          y1="60"
          x2="220"
          y2="220"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b7c9ad" />
          <stop offset="1" stopColor="#7d9879" />
        </linearGradient>
        <linearGradient
          id="b"
          x1="140"
          y1="70"
          x2="240"
          y2="230"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f1e6d8" />
          <stop offset="1" stopColor="#cbb9a4" />
        </linearGradient>
        <filter id="s">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <ellipse
        cx="178"
        cy="217"
        rx="82"
        ry="10"
        fill="#576b49"
        opacity=".12"
        filter="url(#s)"
      />
      <path d="M165 111C145 65 111 38 74 44c-6 50 24 75 67 82" fill="#92aa85" />
      <path d="M159 121c18-51 57-73 88-66 1 39-28 70-75 78" fill="#b1c0a0" />
      <path d="M162 150C131 113 93 98 60 117c9 40 49 54 90 47" fill="#bdcca9" />
      <path d="M161 169c29-33 64-46 96-27-9 33-43 44-80 38" fill="#879e7d" />
      <path
        d="M158 73c13 35 14 76 1 123"
        stroke="#6d8768"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M114 164h95l-10 40a24 24 0 0 1-23 18h-28a24 24 0 0 1-23-18z"
        fill="url(#b)"
      />
      <path
        d="M108 163a6 6 0 0 1 6-6h95a6 6 0 0 1 0 12h-95a6 6 0 0 1-6-6"
        fill="#e4d9c9"
      />
      <ellipse
        cx="232"
        cy="195"
        rx="34"
        ry="16"
        transform="rotate(-27 232 195)"
        stroke="url(#a)"
        strokeWidth="14"
      />
      <ellipse
        cx="256"
        cy="194"
        rx="33"
        ry="16"
        transform="rotate(25 256 194)"
        stroke="#d1b4a3"
        strokeWidth="14"
      />
      <path
        d="m259 71 3-7m6 14 7-2m-21-11-2-5"
        stroke="#acb69b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="86" cy="188" r="4" fill="#d0ae9c" />
      <circle cx="274" cy="117" r="3" fill="#afbf9d" />
    </svg>
  );
}
export function WishArt({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 320 230"
      fill="none"
      role="img"
      aria-label={
        kind === "placeholder"
          ? "Ілюстрація подарунка"
          : kind.includes("headphones")
            ? "Ілюстрація навушників"
            : kind.includes("book")
              ? "Ілюстрація книги"
              : "Ілюстрація кавового ритуалу"
      }
    >
      <defs>
        <linearGradient
          id={`product-${kind}`}
          x1="80"
          y1="40"
          x2="230"
          y2="200"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#faf8f2" />
          <stop offset="1" stopColor="#cccac1" />
        </linearGradient>
      </defs>
      {kind === "placeholder" ? (
        <g stroke="#a6b49b" strokeWidth="5" strokeLinejoin="round">
          <rect x="110" y="103" width="100" height="83" rx="8" fill="#e4e9dc" />
          <rect x="102" y="84" width="116" height="28" rx="7" fill="#eef0e7" />
          <path d="M160 85v101m0-102c-63-1-52-56-22-36 15 10 22 36 22 36s7-26 22-36c30-20 41 35-22 36z" />
        </g>
      ) : kind.includes("headphones") ? (
        <>
          <path
            d="M103 138V100a57 57 0 0 1 114 0v38"
            stroke="#c4c8be"
            strokeWidth="20"
          />
          <path
            d="M103 105v-7a57 57 0 0 1 114 0v7"
            stroke="#e7e8df"
            strokeWidth="14"
          />
          <rect
            x="85"
            y="112"
            width="43"
            height="76"
            rx="20"
            fill={`url(#product-${kind})`}
            transform="rotate(-10 85 112)"
          />
          <rect
            x="195"
            y="112"
            width="43"
            height="76"
            rx="20"
            fill={`url(#product-${kind})`}
            transform="rotate(10 195 112)"
          />
          <path
            d="M108 128v42m106-42v42"
            stroke="#bfc2b9"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : kind.includes("book") ? (
        <>
          <g transform="rotate(-13 160 115)">
            <rect
              x="103"
              y="43"
              width="121"
              height="157"
              rx="5"
              fill="#e8dac4"
            />
            <path d="M107 49h109v146H107z" fill="#d2b29e" />
            <path d="M107 49v146" stroke="#b99480" strokeWidth="9" />
            <path
              d="M143 142c-10-31 5-58 36-61 7 29-6 51-36 61"
              stroke="#f5e8d5"
              strokeWidth="2"
            />
            <path
              d="m140 155 41-75M133 69h57m-55 8h40"
              stroke="#f5e8d5"
              strokeWidth="2"
            />
            <path d="M124 173h77" stroke="#f5e8d5" strokeWidth="2" />
          </g>
        </>
      ) : (
        <>
          <ellipse
            cx="161"
            cy="186"
            rx="83"
            ry="9"
            fill="#9eaa92"
            opacity=".13"
          />
          <path
            d="M116 100h75l-9 69a14 14 0 0 1-14 12h-29a14 14 0 0 1-14-12z"
            fill="#e4dac8"
          />
          <ellipse cx="153" cy="100" rx="38" ry="10" fill="#a68a70" />
          <ellipse cx="153" cy="98" rx="31" ry="7" fill="#e7e1d5" />
          <path
            d="M199 119c39-9 40 43-7 39"
            stroke="#c5b8a0"
            strokeWidth="11"
          />
          <path d="m146 128 12-20 12 20-12 28z" fill="#bda887" />
          <path
            d="M145 76c-17-16 16-15 2-34m26 37c-15-16 15-17 2-36"
            stroke="#b3bda5"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
