"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AddDevicePage() {
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    useEffect(() => {
        // Protected Route Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) router.push("/login");
        });
    }, [router]);

    const handleClaim = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const { data, error } = await supabase.rpc("claim_device", {
                code: code,
                name: name || "Desktop App",
            });

            if (error) throw error;

            alert("Device linked successfully!");
            router.push("/"); // Go to Dashboard
        } catch (err: any) {
            setError(err.message || "Failed to link device");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <h1 className="text-2xl font-bold mb-8">Add New Device</h1>
            <form onSubmit={handleClaim} className="flex flex-col gap-4 w-full max-w-sm">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold">Connection Code</label>
                    <input
                        type="text"
                        placeholder="123456"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="p-4 border rounded text-2xl text-center tracking-widest text-black"
                        maxLength={6}
                        required
                    />
                    <p className="text-xs text-gray-500">
                        Enter the 6-digit code shown on your Desktop App.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold">Device Name (Optional)</label>
                    <input
                        type="text"
                        placeholder="e.g. Home iMac"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="p-3 border rounded text-black"
                    />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                    type="submit"
                    disabled={loading}
                    className="p-3 bg-green-600 text-white rounded font-bold hover:bg-green-700 disabled:opacity-50"
                >
                    {loading ? "Linking..." : "Link Device"}
                </button>
            </form>
        </div>
    );
}
