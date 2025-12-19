
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/src/lib/supabase";
import { useParams } from "next/navigation";

export default function ControlPage() {
    const params = useParams();
    const machineId = params.id as string;
    const [status, setStatus] = useState("connecting");
    const channelRef = useRef<any>(null);

    useEffect(() => {
        // Join the channel
        const channel = supabase.channel(`computer_use_${machineId}`, {
            config: {
                broadcast: { ack: true },
            },
        });

        channel
            .on('broadcast', { event: 'command' }, (payload: any) => {
                // Determine if we need to listen to anything from desktop? 
                // Mostly desktop sends nothing back properly yet, but good to have.
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
                    // Don't set status connected yet, wait for sync to confirm desktop is there
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

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        // Relative movement could be better, but for now sending absolute or mock
        // In a real TeamViewer, we map image coordinates.
        // For AI control, we send actions. 
        // Manual Testing: Just sending a "click" or small updates.
    };

    const handleTestMove = () => {
        sendCommand({ type: 'mousemove', x: 500, y: 500 });
    };

    const handleTestType = () => {
        sendCommand({ type: 'type', text: "Hello from Gemini!" });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-4">
            <h1 className="text-xl font-bold">Controlling: {machineId}</h1>
            <div className={`text-sm font-mono px-2 py-1 rounded ${status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {status.toUpperCase()}
            </div>

            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                <button onClick={handleTestMove} className="p-4 bg-gray-200 rounded hover:bg-gray-300 text-black">
                    Move Mouse to 500,500
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

            <div className="w-full max-w-md border p-4 rounded text-xs text-gray-500">
                <p>Instructions:</p>
                <ul className="list-disc pl-4">
                    <li>Ensure Desktop app is running and shows "Waiting".</li>
                    <li>Click buttons above to send Broadcast commands.</li>
                    <li>Latency should be sub-100ms.</li>
                </ul>
            </div>
        </div>
    );
}
