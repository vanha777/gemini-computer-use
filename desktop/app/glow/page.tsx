"use client";

import { useEffect } from "react";

export default function GlowPage() {
  useEffect(() => {
    // Enforce transparency on mount
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    return () => {
      // Cleanup if we ever navigate away (unlikely for this window)
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          /* Ensure the background is truly transparent */
          background: transparent !important;
          overflow: hidden;
          height: 100vh;
          width: 100vw;
          pointer-events: none; /* Secondary safety */
        }

        body {
          box-sizing: border-box;
          
          /* The "Mutation" effect */
          border: 10px solid rgba(0, 255, 255, 0.5);
          box-shadow: inset 0 0 30px rgba(0, 255, 255, 0.4);
          animation: pulse-glow 1.5s infinite;
        }

        @keyframes pulse-glow {
          0% {
            opacity: 0.2;
            border-width: 5px;
          }
          50% {
            opacity: 1;
            border-width: 12px;
          }
          100% {
            opacity: 0.2;
            border-width: 5px;
          }
        }
      `}</style>
      <div className="w-full h-full bg-transparent" />
    </>
  );
}
