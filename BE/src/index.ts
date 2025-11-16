import dotenv from "dotenv";
dotenv.config();
import express from "express";
import type { Request, Response } from "express";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { BASE_PROMPT, getSystemPrompt } from "./prompts.js";
import { basePrompt as reactBasePrompt, reactBoltArtifact } from "./defaults/react.js";
import { basePrompt as nodeBasePrompt } from "./defaults/node.js";
import cors from "cors"; 

const apiKey = process.env.GEMINI_API_KEY; 
if (!apiKey) { 
  throw new Error("Missing GEMINI_API_KEY in environment variables");
 } 
const ai = new GoogleGenAI({ apiKey });

const app = express();
app.use(cors()); 
app.use(express.json());


interface TemplateRequestBody {
  prompt: string;
}
interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
}


app.post("/template", async (req: Request<{}, {}, TemplateRequestBody>, res: Response) => {
  try {
    const prompt = req.body.prompt;
    const normalizedPrompt = prompt.toLowerCase();

    console.log("Received prompt:", prompt);
    const reactKeywords = ['react', 'frontend', 'ui', 'webpage', 'website', 'component', 'jsx'];
    const nodeKeywords = ['node', 'express', 'backend', 'api server', 'rest api', 'server', 'cli', 'typescript backend', 'api'];

    const hasReactKeyword = reactKeywords.some(keyword => normalizedPrompt.includes(keyword));
    const hasNodeKeyword = nodeKeywords.some(keyword => normalizedPrompt.includes(keyword));
    // First, ask LLM to determine project type
    let answer = "";

    if (hasReactKeyword && !hasNodeKeyword) {
      // If user explicitly mentions React keywords, skip AI and return React
      answer = "react";
      console.log("Detected project type (keyword match):", answer);
    } else if (hasNodeKeyword && !hasReactKeyword) {
      answer = "node";
      console.log("Detected project type (keyword match):", answer);
    } else {
      // Otherwise, ask the AI
      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: [
          {
            role: "user",
            parts: [{ text: req.body.prompt }]
          }
        ],
        config: {
          systemInstruction: "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra",
          temperature: 0,
          maxOutputTokens: 5000
        }
      });
      if (response.text) {
        answer = response.text.trim().toLowerCase();
      } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
        answer = response.candidates[0].content.parts[0].text.trim().toLowerCase();
      } else {
        console.error("No text in response");
        res.status(500).json({ 
          message: "Failed to get response from AI"
        });
        return;
      }
      
      console.log("Detected project type (AI):", answer);
    }
    
    
    // Check if answer contains 'react' or 'node'
    if (answer.includes("react")) {
      console.log("Returning React prompts");
      res.json({
        prompts: [reactBasePrompt,         
          `Here an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBoltArtifact}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`
        ],
        uiPrompts: [reactBoltArtifact]
      });
      return;
    }

    if (answer.includes("node")) {  
      console.log("Returning Node prompts");
      res.json({
        prompts: [
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodeBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`
        ],
        uiPrompts: [nodeBasePrompt]
      });
      return; 
    }

    console.log("Could not determine project type from:", answer);
    res.status(403).json({ 
      message: "You cant access this",
      debug: { receivedAnswer: answer }
    });
    return;
    
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Chat endpoint with streaming
app.post("/chat", async (req: Request<{}, {}, ChatRequestBody>, res: Response) => {
  try {
    const messages = req.body.messages;

    console.log("Received messages:", messages.length);

    // Convert messages to Gemini format
    const geminiMessages = messages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));

    const response = await ai.models.generateContentStream({
      model: "gemini-2.5-pro",
      contents: geminiMessages,
      config: {
        systemInstruction: getSystemPrompt(),
        temperature: 0,
        maxOutputTokens: 40000
      }
    });

    const wantsStream = req.query.stream === "true" || req.headers.accept?.includes("text/event-stream");

    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const sendEvent = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        for await (const chunk of response) {
          if (chunk.text) {
            sendEvent({ type: "chunk", text: chunk.text });
          }
        }
        sendEvent({ type: "done" });
        res.end();
      } catch (streamError) {
        console.error("Streaming error:", streamError);
        sendEvent({
          type: "error",
          message: streamError instanceof Error ? streamError.message : "Unknown streaming error"
        });
        res.end();
      }
      return;
    }

    let fullResponse = "";
    
    for await (const chunk of response) {
      if (chunk.text) {
        fullResponse += chunk.text;
      }
    }

    console.log("Full response length:", fullResponse.length);

    // Return the complete response as JSON
    res.json({
      response: fullResponse,
      success: true
    });

  } catch (error) {
    console.error("Error in chat:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
});


  
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});