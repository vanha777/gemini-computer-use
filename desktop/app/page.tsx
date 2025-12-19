
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

    // Check for existing User ID (Already linked?)
    const savedUserId = localStorage.getItem("user_id");

    // Register session (initial setup)
    const registerSession = async () => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setConnectionCode(code);

      // We still update the DB for initial discovery, but status is managed via Presence now
      // Upsert current state
      // If we have a user_id, we include it to ensure we are "online" for that user
      // If we don't, we remain "waiting" for a claim
      await supabase
        .from("computer_use_sessions")
        .upsert({
          machine_id: id,
          connection_code: code,
          // If we are already linked, we are active immediately (subject to presence)
          status: savedUserId ? "active" : "waiting",
          user_id: savedUserId || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "machine_id" });

      const channel = supabase.channel(`computer_use_${id}`, {
        config: {
          presence: {
            key: 'desktop',
          },
        },
      });

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
          // Watch for "Claiming" event (user_id changing from null to something)
          const newUser = payload.new.user_id;
          if (newUser && newUser !== savedUserId) {
            console.log("Device claimed by user:", newUser);
            localStorage.setItem("user_id", newUser);
            // Reload to pick up new state or just set it
            window.location.reload();
          }
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          console.log("Presence sync:", state);

          // Check if a controller is present
          const hasController = Object.values(state).some((presences: any) =>
            presences.some((p: any) => p.type === 'controller')
          );

          if (hasController) {
            setStatus("active");
          } else {
            // If linked, we show distinct status
            setStatus(localStorage.getItem("user_id") ? "linked_waiting" : "waiting_to_be_claimed");
          }
        })
        .subscribe(async (status) => {
          console.log("Subscription status:", status);
          if (status === "SUBSCRIBED") {
            // Track our presence as 'desktop'
            // Track presence with User ID if available
            await channel.track({
              type: 'desktop',
              user_id: savedUserId,
              online_at: new Date().toISOString()
            });

            setStatus(savedUserId ? "linked_waiting" : "waiting_to_be_claimed");
          } else if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
            setStatus("disconnected");
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

