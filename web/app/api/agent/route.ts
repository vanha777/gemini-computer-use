import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import sizeOf from "image-size";

const geminiApiKey = process.env.GEMINI_API_KEY;
const claudeApiKey = process.env.CLAUDE_API_KEY;

// Gemini setup
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Claude setup
const anthropic = claudeApiKey ? new Anthropic({
    apiKey: claudeApiKey,
}) : null;

export async function POST(req: Request) {
    try {
        const { history, prompt, screenshot, model } = await req.json();

        // Default to Gemini if no model specified or if model string contains "gemini"
        if (!model || model.toLowerCase().includes("gemini")) {
            return handleGemini(model, history, prompt, screenshot);
        } else if (model.toLowerCase().includes("claude")) {
            return handleClaude(model, history, prompt, screenshot);
        } else {
            return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
        }

    } catch (error: any) {
        console.error("Agent API Error:", error);
        return NextResponse.json({ error: error.message || "Unknown error", details: error.toString() }, { status: 500 });
    }
}

async function handleGemini(modelName: string, history: any[], prompt: string, screenshot: string) {
    if (!genAI) {
        return NextResponse.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
    }

    // Default to the preview model if just "gemini" is passed or if specific one isn't clear
    // But usually frontend will pass full string. 
    // If frontend passes just "gemini", we use the one from the original file.
    let targetModel = modelName;
    if (modelName === "gemini" || !modelName) {
        targetModel = "gemini-2.5-computer-use-preview-10-2025";
    }

    const modelVal = genAI.getGenerativeModel({
        model: targetModel,
        systemInstruction: {
            role: "system",
            parts: [{
                text: `You are a computer use agent. Your goal is to help the user control their computer to accomplish tasks. Critical: When the user's task is complete, you MUST include the word "DONE" in your response to terminate the session.`
            }]
        }
    });

    // 1. Correct syntax for the native Computer Use tool
    const tools = [
        {
            // @ts-ignore - The SDK types are currently being updated for this preview
            computerUse: {
                environment: "ENVIRONMENT_BROWSER", // Mandatory field
            }
        }
    ];

    // 2. Format the screenshot part
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

    const chat = modelVal.startChat({
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
}

async function handleClaude(modelName: string, history: any[], prompt: string, screenshot: string) {
    console.log("Handling Claude request for model:", modelName);

    // Extract dimensions from screenshot
    let imgWidth = 1920;
    let imgHeight = 1080;

    if (screenshot) {
        try {
            const buffer = Buffer.from(screenshot, 'base64');
            const dims = sizeOf(buffer);
            if (dims.width && dims.height) {
                imgWidth = dims.width;
                imgHeight = dims.height;
                console.log(`Detected screenshot dimensions: ${imgWidth}x${imgHeight} `);
            }
        } catch (err) {
            console.error("Failed to get image dimensions:", err);
        }
    }

    // Force to Sonnet 4.5 for Computer Use (2025 version)
    // The previous "Sonnet 3.5 20241022" seems to be 404 or deprecated/renamed in this environment?
    // Based on search, standard model is claude-sonnet-4-5-20250929
    const effectiveModel = "claude-sonnet-4-5-20250929";
    if (modelName !== effectiveModel) {
        console.log(`Model ${modelName} may not support computer use.Defaulting to ${effectiveModel} `);
    }

    if (!anthropic) {
        console.error("CLAUDE_API_KEY is missing or invalid");
        return NextResponse.json({ error: "CLAUDE_API_KEY is not set" }, { status: 500 });
    }

    // Convert history to Anthropic format
    const messages: any[] = (history || []).map((h: any) => {
        const role = h.role === "model" ? "assistant" : "user";
        let content: any = "";

        // Handle parts if they exist
        if (h.parts && h.parts.length > 0) {
            // For text parts
            const textParts = h.parts.filter((p: any) => p.text).map((p: any) => p.text).join(" ");
            if (textParts) content = textParts;
        } else if (typeof h.content === "string") {
            content = h.content;
        }

        // If content is still empty, fallback to empty string (Claude generally dislikes empty content)
        // But for "assistant" messages with tool calls, content might be empty text but have tool_calls. Since we are mapping back and forth simpler, 
        // we essentially just preserve text history for now.
        if (!content) content = " ";

        return { role, content };
    });

    // Add new message
    const newMessageContent: any[] = [
        { type: "text", text: prompt }
    ];
    if (screenshot) {
        newMessageContent.push({
            type: "image",
            source: {
                type: "base64",
                media_type: "image/jpeg",
                data: screenshot
            }
        });
    }

    messages.push({
        role: "user",
        content: newMessageContent
    });

    try {
        const msg = await anthropic.messages.create({
            model: effectiveModel,
            max_tokens: 1024,
            messages: messages,
            tools: [
                {
                    // @ts-ignore
                    type: "computer_20250124", // Updated tool type based on 20250124 beta
                    name: "computer",
                    // Use actual image dimensions as the screen resolution
                    display_width_px: imgWidth,
                    display_height_px: imgHeight,
                } as any
            ],
            // Enable the 2025 beta
        }, {
            headers: {
                "anthropic-beta": "computer-use-2025-01-24"
            }
        });

        // Map response to match Gemini's return format expected by frontend
        // Frontend expects: { text, functionCalls: [{ name, args }], history }

        const responseText = msg.content
            .filter(c => c.type === "text")
            .map(c => (c as any).text)
            .join("\n");

        const functionCalls: any[] = [];

        // Helper to normalize coordinates from Image Dims (Claude) to 1000x1000 (Desktop App)
        const normalize = (val: number, max: number) => Math.round((val / max) * 1000);

        const toolUses = msg.content.filter(c => c.type === "tool_use");
        for (const toolUse of toolUses) {
            const input = (toolUse as any).input;
            const action = input.action;

            // Map generic 'computer' tool actions to frontend specific commands
            if ((toolUse as any).name === "computer") {
                if (action === "mouse_move") {
                    functionCalls.push({
                        name: "hover_at",
                        args: {
                            x: normalize(input.coordinate[0], imgWidth),
                            y: normalize(input.coordinate[1], imgHeight)
                        }
                    });
                } else if (action === "left_click") {
                    functionCalls.push({ name: "click", args: { button: "left" } });
                } else if (action === "right_click") {
                    functionCalls.push({ name: "click", args: { button: "right" } });
                } else if (action === "middle_click") {
                    functionCalls.push({ name: "click", args: { button: "middle" } });
                } else if (action === "double_click") {
                    functionCalls.push({ name: "double_click", args: {} });
                } else if (action === "type") {
                    functionCalls.push({ name: "type", args: { text: input.text } });
                } else if (action === "key") {
                    functionCalls.push({ name: "key", args: { text: input.text } });
                } else if (action === "screenshot") {
                    functionCalls.push({ name: "capture_screenshot", args: {} });
                } else if (action === "cursor_position") {
                    // This is usually to get cursor position.
                    // We might not have a direct map, or we treat it as no-op/info retrieval?
                    // Frontend doesn't seem to have a return path for this easily without screenshot.
                    // We'll skip for now.
                } else if (action === "left_click_drag") {
                    functionCalls.push({
                        name: "drag",
                        args: {
                            button: "left",
                            x: normalize(input.coordinate[0], imgWidth),
                            y: normalize(input.coordinate[1], imgHeight)
                        }
                    });
                }
                // Add more mappings as needed
            }
        }

        const newHistory = [...history];
        newHistory.push({
            role: "user",
            parts: [{ text: prompt }]
        });
        newHistory.push({
            role: "model",
            parts: [{ text: responseText }]
        });

        return NextResponse.json({
            text: responseText,
            functionCalls: functionCalls,
            history: newHistory
        });

    } catch (error: any) {
        console.error("Claude API Error:", error);
        return NextResponse.json({ error: error.message || "Claude API Error" }, { status: 500 });
    }
}
