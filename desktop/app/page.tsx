
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/src/lib/supabase";
import { useDesktopControl } from "@/src/hooks/use-desktop-control";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from '@tauri-apps/plugin-opener';

export default function Home() {
  const [machineId, setMachineId] = useState<string>("");
  // Use Ref for dims to avoid stale closures in the event listener
  const screenDimsRef = useRef<{
    original: { w: number, h: number },
    logical: { w: number, h: number },
    scaled: { w: number, h: number },
    scale_factor: number,
    offset: { x: number, y: number }
  } | null>(null);

  // Keep state for UI if needed, or just use ref. Since we don't display dims, ref is fine.
  // Actually, keeping state might be useful for debugging if we wanted to show it, 
  // but for the logic, the ref is critical.

  const [status, setStatus] = useState<string>("disconnected");
  const [connectionCode, setConnectionCode] = useState<string>("");
  const { moveMouse, clickMouse, typeText, mouseDown, mouseUp, scroll, pressKey } = useDesktopControl();
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

  // Helper to scale coordinates
  const scaleCoords = (x: number, y: number) => {
    const dims = screenDimsRef.current;
    if (!dims) {
      console.warn("Screen dims not set, using raw coordinates");
      return { x, y }; // Fallback
    }

    // AI Coord -> Logical Coord
    // Gemini 2.x Computer Use uses 1000x1000 normalized coordinates by default
    // regardless of the aspect ratio of the input image.
    // So (500, 500) is always the center of the total screen space.

    const logicalX = (x / 1000 * dims.logical.w) + dims.offset.x;
    const logicalY = (y / 1000 * dims.logical.h) + dims.offset.y;

    console.log(`[ScaleCoords] Input: (${x}, ${y})`);
    console.log(`[ScaleCoords] Dims: Logical(${dims.logical.w}x${dims.logical.h}), Normalization(1000x1000), Offset(${dims.offset.x},${dims.offset.y})`);
    console.log(`[ScaleCoords] Result: (${Math.round(logicalX)}, ${Math.round(logicalY)})`);

    return {
      x: Math.round(logicalX),
      y: Math.round(logicalY)
    };
  };

  const handleCommand = async (cmd: any, channel: any) => {

    switch (cmd.type) {
      case "params":
        // Initial setup params, ignore
        break;

      // Native Gemini Computer Use Actions
      case "click_at": {
        const x = cmd.x || cmd.x_coordinate;
        const y = cmd.y || cmd.y_coordinate;
        if (x !== undefined && y !== undefined) {
          const scaled = scaleCoords(x, y);
          console.log(`Scaling click: AI(${x},${y}) -> Logical(${scaled.x},${scaled.y})`);
          await moveMouse(scaled.x, scaled.y);
        }
        await clickMouse("left"); // Native tool usually implies left click
        break;
      }

      case "type_text_at": {
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
      }

      case "drag_and_drop": {
        const source = cmd.source;
        const dest = cmd.destination;
        if (source && dest) {
          const s = scaleCoords(source.x, source.y);
          const d = scaleCoords(dest.x, dest.y);
          await moveMouse(s.x, s.y);
          await new Promise(r => setTimeout(r, 100)); // stabilize
          await mouseDown("left");
          await new Promise(r => setTimeout(r, 100));
          await moveMouse(d.x, d.y);
          await new Promise(r => setTimeout(r, 100));
          await mouseUp("left");
        }
        break;
      }

      case "hover_at": {
        const x = cmd.x || cmd.x_coordinate;
        const y = cmd.y || cmd.y_coordinate;
        if (x !== undefined && y !== undefined) {
          const scaled = scaleCoords(x, y);
          await moveMouse(scaled.x, scaled.y);
        }
        break;
      }

      case "scroll_at": {
        const x = cmd.x || cmd.x_coordinate;
        const y = cmd.y || cmd.y_coordinate;
        if (x !== undefined && y !== undefined) {
          const scaled = scaleCoords(x, y);
          await moveMouse(scaled.x, scaled.y);
        }
        // Direction typically "up" or "down". 
        // 100 is an arbitrary scroll amount, tunable.
        const deltaY = cmd.direction === "up" ? -100 : 100;
        await scroll(0, deltaY);
        break;
      }

      case "scroll_document": {
        const deltaY = cmd.direction === "up" ? -500 : 500;
        await scroll(0, deltaY);
        break;
      }

      case "key_combination": {
        const keys = cmd.keys || []; // e.g. ["Control", "c"]
        // Separate modifiers from main key
        const modifiers = keys.filter((k: string) => ["Control", "Ctrl", "Alt", "Option", "Shift", "Meta", "Command", "Super"].includes(k));
        const mainKey = keys.find((k: string) => !modifiers.includes(k));

        if (mainKey) {
          await pressKey(mainKey, modifiers);
        } else if (modifiers.length > 0) {
          // Just modifiers? Rare but possible.
          // We can just press them via press_key("Meta", []) logic or handle separately? 
          // Our backend implementation presses then releases immediately if passed as main 'key'.
          // Proper way: pressKey expects a main key. If user just sends "Control", we might trap it.
          // But usually it's "Control" + "c".
          await pressKey(modifiers[0], []); // fallback
        }
        break;
      }

      case "wait_5_seconds":
        console.log("Waiting 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        break;

      case "navigate":
        console.log("Handling navigate..., ", cmd);
        if (cmd.url) {
          await openUrl(cmd.url);
        }
        break;

      case "open_web_browser":
        console.log("Handling open_web_browser..., ", cmd);
        try {
          // Some implementations might send a url with this command
          const targetUrl = cmd.url || "https://google.com";
          await openUrl(targetUrl);
          console.log("Browser opened successfully to", targetUrl);
        } catch (err) {
          console.error("Failed to open browser:", err);
        }
        break;

      case "Maps":
        console.log("Handling Maps..., ", cmd);
        // "Maps" is the action name for "Navigates to a specific URL" in some Gemini contexts
        if (cmd.url) {
          await openUrl(cmd.url);
        } else {
          await openUrl("https://maps.google.com");
        }
        break;

      case "go_back":
        // Mac: Cmd + [
        await pressKey("[", ["Meta"]);
        break;

      case "go_forward":
        // Mac: Cmd + ]
        await pressKey("]", ["Meta"]);
        break;

      case "search":
        if (cmd.query) {
          await openUrl(`https://www.google.com/search?q=${encodeURIComponent(cmd.query)}`);
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

          const newDims = {
            original: { w: response.original_width, h: response.original_height },
            logical: { w: response.logical_width, h: response.logical_height },
            scaled: { w: response.scaled_width, h: response.scaled_height },
            scale_factor: response.scale_factor || 1,
            offset: { x: response.x_offset || 0, y: response.y_offset || 0 }
          };

          screenDimsRef.current = newDims;
          console.log("Updated screen dims ref:", newDims);

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
