"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/src/lib/supabase";
import { useParams } from "next/navigation";

export default function ControlPage() {
    const params = useParams();
    const machineId = params.id as string;
    const [status, setStatus] = useState("connecting");
    const channelRef = useRef<any>(null);
    const [prompt, setPrompt] = useState("this is a test, try to move mouse onto the center of this screen then stop.");
    const [history, setHistory] = useState<any[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    // We use a ref to resolve the promise when a screenshot arrives
    const screenshotResolver = useRef<((value: string) => void) | null>(null);

    useEffect(() => {
        // Join the channel
        const channel = supabase.channel(`computer_use_${machineId}`, {
            config: {
                broadcast: { ack: true },
            },
        });

        channel
            .on('broadcast', { event: 'command' }, (payload: any) => {
                const cmd = payload.payload;
                if (cmd.type === 'screenshot_response') {
                    if (screenshotResolver.current) {
                        screenshotResolver.current(cmd.image);
                        screenshotResolver.current = null;
                    }
                }
                console.log("Received broadcast from desktop:", payload);
            })
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                console.log("Presence sync:", state);

                // Check if desktop is present
                const hasDesktop = Object.values(state).some((presences: any) =>
                    presences.some((p: any) => p.type === 'desktop')
                );

                if (hasDesktop) {
                    setStatus("connected");
                } else {
                    setStatus("waiting_for_desktop");
                }
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    // Track our presence as 'controller'
                    await channel.track({ type: 'controller', online_at: new Date().toISOString() });
                } else if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
                    setStatus("disconnected");
                }
            });

        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
        };
    }, [machineId]);

    const sendCommand = async (payload: any) => {
        if (!channelRef.current) return;
        await channelRef.current.send({
            type: "broadcast",
            event: "command",
            payload: payload,
        });
    };

    const handleTestMove = () => {
        // Test: 960, 540 is center of 1920x1080. If scaling is wrong, it would land elsewhere.
        // Assuming user has standard 1080p for test.
        sendCommand({ type: 'mousemove', x: 760, y: 540 });
    };

    const handleTestType = () => {
        sendCommand({ type: 'type', text: "Hello from Gemini!" });
    };

    const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

    const getScreenshot = (): Promise<string> => {
        return new Promise((resolve, reject) => {
            // Set a timeout
            const timeout = setTimeout(() => {
                if (screenshotResolver.current) {
                    screenshotResolver.current = null;
                    reject("Screenshot timed out");
                }
            }, 15000); // 15s timeout for large images

            screenshotResolver.current = (img: string) => {
                clearTimeout(timeout);
                resolve(img);
            };

            sendCommand({ type: "capture_screenshot" });
        });
    };

    const startAIControl = async () => {
        if (!channelRef.current || status !== 'connected') {
            alert("Not connected to desktop");
            return;
        }

        setIsTyping(true);
        setLogs([]);
        addLog("Starting AI Control...");

        try {
            console.log("History:", history);
            let currentHistory = [...history]; // Use state history if we want continuation? For now starting fresh mostly.
            // If user wants to continue a session, we should use `history`. 
            // For this implementation, let's reset history on new "Start" unless we add a "Continue" button. 
            // The prompt "navigate..." implies a new task.
            currentHistory = [];

            let loopCount = 0;
            const MAX_LOOPS = 20;

            while (loopCount < MAX_LOOPS) {
                loopCount++;
                addLog(`Loop ${loopCount}: Capturing screenshot...`);

                // 1. Capture Screenshot
                let screenshotBase64 = null;
                try {
                    screenshotBase64 = await getScreenshot();
                    addLog("Screenshot captured.");
                } catch (e) {
                    addLog("Failed to get screenshot: " + e);
                    break;
                }

                // 2. Send to Gemini
                addLog("Sending to Gemini...");
                const promptToSend = loopCount === 1 ? `Plan: ${prompt}` : "Here is the current screen state.";

                const res = await fetch("/api/gemini", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: promptToSend,
                        history: currentHistory,
                        screenshot: screenshotBase64
                    })
                });

                const data = await res.json();
                if (data.error) throw new Error(data.error);

                addLog(`Gemini: ${data.text ? data.text.substring(0, 50) + "..." : "No text"}`);

                // Update history with authoritative history from server
                if (data.history) {
                    currentHistory = data.history;
                } else {
                    // Fallback (should not happen with new API)
                    currentHistory.push({
                        role: "user",
                        parts: [{ text: promptToSend }]
                    });
                    currentHistory.push({
                        role: "model",
                        parts: [{ text: data.text || "" }]
                    });
                }

                // Handling Function Calls
                if (data.functionCalls && data.functionCalls.length > 0) {
                    addLog(`Executing ${data.functionCalls.length} actions...`);
                    for (const call of data.functionCalls) {
                        addLog(`Action: ${call.name} ${JSON.stringify(call.args)}`);
                        // Execute on desktop
                        await sendCommand({
                            type: call.name, // click, mousemove, type
                            ...call.args
                        });
                        // Wait a bit?
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    // Add function response to history? 
                    // To do it properly we'd need to send "function_response" back to model in next turn.
                    // My simplified API doesn't handle function responses in history explicitly yet. 
                    // It just treats next turn as "user: here is screen". This is often "good enough" for visual agents.
                } else {
                    addLog("No actions requested.");
                    if (data.text && data.text.toLowerCase().includes("done")) {
                        addLog("Task looks complete.");
                        break;
                    }
                    if (loopCount > 1) {
                        // Check if model asked a question?
                        // For now break to avoid infinite loop
                        // addLog("No actions, breaking.");
                        // break; 
                    }
                }

                // Wait before next loop
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (e: any) {
            addLog("Error: " + e.message);
        } finally {
            setIsTyping(false);
            setHistory([]);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-4">
            <h1 className="text-xl font-bold">Controlling: {machineId}</h1>
            <div className={`text-sm font-mono px-2 py-1 rounded ${status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {status.toUpperCase()}
            </div>

            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                <button onClick={handleTestMove} className="p-4 bg-gray-200 rounded hover:bg-gray-300 text-black">
                    Move to Center (760,540)
                </button>
                <button onClick={handleTestType} className="p-4 bg-gray-200 rounded hover:bg-gray-300 text-black">
                    Type "Hello..."
                </button>
                <button
                    onClick={() => sendCommand({ type: 'click', button: 'left' })}
                    className="p-4 bg-blue-100 rounded hover:bg-blue-200 text-blue-900 col-span-2"
                >
                    Left Click
                </button>
            </div>

            {/* AI Control Panel */}
            <div className="flex flex-col gap-4 w-full max-w-md border-t pt-8">
                <h2 className="text-lg font-bold">AI Control</h2>
                <textarea
                    className="w-full p-2 border rounded text-black"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />
                <button
                    onClick={startAIControl}
                    disabled={isTyping}
                    className={`p-3 rounded font-bold text-white ${isTyping ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    {isTyping ? "AI is Working..." : "Start AI Control"}
                </button>
            </div>

            {/* Logs */}
            <div className="w-full max-w-md bg-black text-green-400 text-xs p-4 rounded h-64 overflow-y-auto font-mono border border-green-800">
                {logs.map((log, i) => (
                    <div key={i} className="border-b border-gray-900 py-1">{log}</div>
                ))}
            </div>

            <div className="w-full max-w-md border p-4 rounded text-xs text-gray-500">
                <p>Instructions:</p>
                <ul className="list-disc pl-4">
                    <li>Ensure Desktop app is running and shows "Waiting".</li>
                    <li>Enter a prompt like "Navigate to Google"</li>
                    <li>Click Start AI Control.</li>
                    <li><b>Note:</b> Requires GEMINI_API_KEY in .env.local</li>
                </ul>
            </div>
        </div>
    );
}
