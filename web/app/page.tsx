"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(1200px 600px at 50% 20%, #1f2937, #020617)",
        color: "#fff",
      }}
    >
      <div style={{ textAlign: "center" }}>
        {/* Собака */}
        <div style={{ fontSize: 140, lineHeight: 1 }}>🐕‍🦺</div>

        {/* Табличка */}
        <button
          onClick={() => router.push("/bg")}
          style={{
            marginTop: 20,
            padding: "14px 26px",
            borderRadius: 16,
            border: "2px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.35)",
            color: "#fff",
            fontSize: 20,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            transition: "transform 0.15s ease, background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.background = "rgba(0,0,0,0.35)";
          }}
        >
          sobakevich / bg
        </button>

        {/* подпись */}
        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.65 }}>
          Хаб настольных игр
        </div>
      </div>
    </div>
  );
}
