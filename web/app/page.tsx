
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

export default function Home() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { data, error } = await supabase
      .from("computer_use_sessions")
      .select("machine_id, status")
      .eq("connection_code", code)
      .single();

    if (error || !data) {
      setError("Invalid connection code");
      return;
    }

    // Determine the machine ID from the session found
    const machineId = data.machine_id;
    router.push(`/control/${machineId}`);
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start text-center sm:text-left">
        <h1 className="text-2xl font-bold">Connect to Desktop</h1>

        <form onSubmit={handleConnect} className="flex flex-col gap-4 w-full max-w-sm">
          <input
            type="text"
            placeholder="Enter Connection Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="p-4 border rounded text-2xl text-center tracking-widest text-black"
            maxLength={6}
          />
          {error && <p className="text-red-500 text-sm h-4">Error: {error}</p>}
          <button
            type="submit"
            className="p-3 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition"
          >
            Connect
          </button>
        </form>
      </main>
    </div>
  );
}
