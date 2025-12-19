"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Device = {
  machine_id: string;
  device_name: string;
  status: string;
  updated_at: string;
};

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("computer_use_sessions")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) console.error("Error fetching devices:", error);
    else setDevices(data || []);

    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <div className="p-8">Loading Dashboard...</div>;

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Devices</h1>
        <div className="flex gap-4">
          <Link href="/add-device">
            <button className="bg-blue-600 px-4 py-2 rounded text-white font-bold hover:bg-blue-700">
              + Add Device
            </button>
          </Link>
          <button onClick={handleLogout} className="text-gray-500 hover:text-red-500">
            Logout
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed rounded-lg text-gray-500">
          No devices linked yet.
          <br />
          <Link href="/add-device" className="text-blue-500 hover:underline mt-2 inline-block">
            Link your first computer
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            // Simple "active" check based on updated_at recency could be added
            // For now relies on status from DB
            const isOnline = device.status === 'active' || device.status === 'linked_waiting';

            return (
              <div
                key={device.machine_id}
                onClick={() => router.push(`/control/${device.machine_id}`)}
                className={`
                  p-6 rounded-lg border cursor-pointer transition hover:shadow-lg
                  ${isOnline ? 'bg-white border-green-200 dark:bg-gray-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-900 opacity-70'}
                `}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-400 font-mono">
                    {device.machine_id.slice(0, 8)}...
                  </span>
                </div>

                <h3 className="text-xl font-bold mb-1">{device.device_name}</h3>
                <p className="text-sm text-gray-500 capitalize">
                  {device.status.replace(/_/g, " ")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
