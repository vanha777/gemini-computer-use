
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useDesktopControl } from "@/src/hooks/use-desktop-control";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from '@tauri-apps/plugin-opener';

export default function Home() {
  const [machineId, setMachineId] = useState<string>("");
  const [screenDims, setScreenDims] = useState<{
    original: { w: number, h: number },
    scaled: { w: number, h: number },
    scale_factor: number
  } | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [connectionCode, setConnectionCode] = useState<string>("");
  const { moveMouse, clickMouse, typeText } = useDesktopControl();
  const [channelRef, setChannelRef] = useState<any>(null);

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
      await supabase
        .from("computer_use_sessions")
        .upsert({
          machine_id: id,
          connection_code: code,
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
          handleCommand(payload.payload, channel);
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "computer_use_sessions",
          filter: `machine_id=eq.${id}`,
        }, (payload) => {
          // Watch for "Claiming" event
          const newUser = payload.new.user_id;
          if (newUser && newUser !== savedUserId) {
            console.log("Device claimed by user:", newUser);
            localStorage.setItem("user_id", newUser);
            window.location.reload();
          }
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();

          // Check if a controller is present
          const hasController = Object.values(state).some((presences: any) =>
            presences.some((p: any) => p.type === 'controller')
          );

          if (hasController) {
            setStatus("active");
          } else {
            setStatus(localStorage.getItem("user_id") ? "linked_waiting" : "waiting_to_be_claimed");
          }
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
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

      setChannelRef(channel);

      return () => {
        supabase.removeChannel(channel);
      }
    };

    registerSession();
  }, []);

  const handleCommand = async (cmd: any, channel: any) => {

    // Helper to scale coordinates
    const scaleCoords = (x: number, y: number) => {
      if (!screenDims) return { x, y }; // Fallback

      // AI Coord -> Physical Coord -> Logical Coord
      // 1. Scale AI (1024) to Physical (e.g. 3024)
      const physicalX = x * (screenDims.original.w / screenDims.scaled.w);
      const physicalY = y * (screenDims.original.h / screenDims.scaled.h);

      // 2. Scale Physical to Logical (Enigo uses logical coordinates on macOS)
      const logicalX = physicalX / screenDims.scale_factor;
      const logicalY = physicalY / screenDims.scale_factor;

      return {
        x: Math.round(logicalX),
        y: Math.round(logicalY)
      };
    };

    switch (cmd.type) {
      case "params":
        // Initial setup params, ignore
        break;

      // Native Gemini Computer Use Actions
      case "click_at":
        const x = cmd.x || cmd.x_coordinate;
        const y = cmd.y || cmd.y_coordinate;
        if (x !== undefined && y !== undefined) {
          const scaled = scaleCoords(x, y);
          console.log(`Scaling click: AI(${x},${y}) -> Logical(${scaled.x},${scaled.y})`);
          await moveMouse(scaled.x, scaled.y);
        }
        await clickMouse("left"); // Native tool usually implies left click
        break;

      case "type_text_at":
        // Some versions of the model might include coordinates for typing
        const tx = cmd.x || cmd.x_coordinate;
        const ty = cmd.y || cmd.y_coordinate;
        if (tx !== undefined && ty !== undefined) {
          const scaled = scaleCoords(tx, ty);
          await moveMouse(scaled.x, scaled.y);
          await clickMouse("left"); // Click to focus
        }
        await typeText(cmd.text);
        break;

      case "drag_and_drop":
        console.warn("Drag and drop not fully implemented yet");
        break;

      case "open_web_browser":
        console.log("Handling open_web_browser...");
        try {
          await openUrl("https://google.com");
          console.log("Browser opened successfully");
        } catch (err) {
          console.error("Failed to open browser:", err);
        }
        break;

      // Legacy / Fallback
      case "mousemove":
        await moveMouse(cmd.x, cmd.y);
        break;
      case "click":
        if (cmd.x !== undefined && cmd.y !== undefined) {
          await moveMouse(cmd.x, cmd.y);
        }
        await clickMouse(cmd.button || "left");
        break;
      case "type":
        await typeText(cmd.text);
        break;

      case "capture_screenshot":
        console.log("Capturing screenshot...");
        try {
          const response: any = await invoke("capture_screen");

          setScreenDims({
            original: { w: response.original_width, h: response.original_height },
            scaled: { w: response.scaled_width, h: response.scaled_height },
            scale_factor: response.scale_factor || 1
          });

          if (channel) {
            await channel.send({
              type: "broadcast",
              event: "command",
              payload: {
                type: "screenshot_response",
                image: response.image
              }
            });
          }
        } catch (e) {
          console.error("Failed to capture screenshot:", e);
        }
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
