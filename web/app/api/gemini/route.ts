
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey!);

const model = genAI.getGenerativeModel({
    model: "gemini-2.5-computer-use-preview-10-2025",
    systemInstruction: {
        role: "system",
        parts: [{
            text: `You are a computer use agent. Your goal is to help the user control their computer to accomplish tasks. Critical: When the user's task is complete, you MUST include the word "DONE" in your response to terminate the session.`
        }]
    }
});



export async function POST(req: Request) {
    if (!apiKey) {
        return NextResponse.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
    }

    try {
        const { history, prompt, screenshot } = await req.json();

        // 1. Correct syntax for the native Computer Use tool
        const tools = [
            {
                // @ts-ignore - The SDK types are currently being updated for this preview
                computerUse: {
                    environment: "ENVIRONMENT_BROWSER", // Mandatory field
                }
            }
        ];

        // 2. Format the screenshot part (Note camelCase: inlineData)
        const parts: any[] = [];
        parts.push({ text: prompt });
        if (screenshot) {
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: screenshot // Must be base64 string
                }
            });
        }

        const chat = model.startChat({
            history: history || [],
            tools: tools as any,
        });

        const result = await chat.sendMessage(parts);
        const response = result.response;

        // 3. Extract the actions
        const functionCalls = response.functionCalls();
        const text = response.text();

        return NextResponse.json({
            text: text,
            functionCalls: functionCalls,
            history: await chat.getHistory()
        });

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
