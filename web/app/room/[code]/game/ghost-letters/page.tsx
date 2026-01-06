"use client";
import { useParams } from "next/navigation";
import GhostLettersRoom from "../../../../../lib/games/ghost-letters/Room";

export default function Page() {
  const { code } = useParams() as any;
  return <GhostLettersRoom code={String(code)} />;
}
