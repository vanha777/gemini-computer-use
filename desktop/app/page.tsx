
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useDesktopControl } from "@/src/hooks/use-desktop-control";

export default function Home() {
  const [machineId, setMachineId] = useState<string>("");
  const [status, setStatus] = useState<string>("disconnected");
  const [connectionCode, setConnectionCode] = useState<string>("");
  const { moveMouse, clickMouse, typeText } = useDesktopControl();

  useEffect(() => {
    // Generate or retrieve existing machine ID
    let id = localStorage.getItem("machine_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("machine_id", id);
    }
    setMachineId(id);

    // Register session
    const registerSession = async () => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setConnectionCode(code);

      const { error } = await supabase
        .from("computer_use_sessions")
        .upsert({
          machine_id: id,
          connection_code: code,
          status: "pending",
          updated_at: new Date().toISOString(),
        }, { onConflict: "machine_id" });

      if (error) console.error("Error registering session:", error);

      // Listen for commands (using broadcast for low latency)
      const channel = supabase.channel(`computer_use_${id}`);

      channel
        .on("broadcast", { event: "command" }, (payload) => {
          console.log("Received command:", payload);
          handleCommand(payload.payload);
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "computer_use_sessions",
          filter: `machine_id=eq.${id}`,
        }, (payload) => {
          console.log("Session update:", payload);
          setStatus(payload.new.status);
        })
        .subscribe((status) => {
          console.log("Subscription status:", status);
          if (status === "SUBSCRIBED") {
            setStatus("waiting_for_connection");
          }
        });

      return () => {
        supabase.removeChannel(channel);
      }
    };

    registerSession();
  }, []);

  const handleCommand = async (cmd: any) => {
    switch (cmd.type) {
      case "params": // Legacy/Web usage often sends type: params
      case "mousemove":
        await moveMouse(cmd.x, cmd.y);
        break;
      case "click":
        await clickMouse(cmd.button || "left");
        break;
      case "type":
        await typeText(cmd.text);
        break;
      default:
        console.warn("Unknown command:", cmd);
    }
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start text-center sm:text-left">
        <h1 className="text-2xl font-bold">Gemini Computer Use</h1>

        <div className="flex flex-col gap-4 p-6 border rounded-lg bg-gray-50 dark:bg-gray-900 w-full max-w-md">
          <div className="flex justify-between">
            <span className="text-gray-500">Status:</span>
            <span className={`font-mono font-bold ${status === 'active' ? 'text-green-500' : 'text-yellow-500'}`}>
              {status.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <span className="text-sm text-gray-500">Connection Code</span>
            <span className="text-4xl font-mono font-bold tracking-wider text-center border-2 border-dashed p-4 rounded bg-white dark:bg-black">
              {connectionCode || "..."}
            </span>
          </div>

          <div className="text-xs text-gray-400 mt-4">
            Machine ID: {machineId}
          </div>


          <button
            onClick={async () => {
              const { openUrl } = await import('@tauri-apps/plugin-opener');
              await openUrl('http://localhost:3001');
            }}
            className="mt-4 p-3 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition w-full"
          >
            Login / Connect
          </button>
        </div>
      </main>
    </div>
  );
}

