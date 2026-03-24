import * as vscode from "vscode";
import * as https from "https";

const SYSTEM_PROMPT = `You are a GAME DSL expert. GAME is a shader language that compiles to Web Components.

Generate a single GAME component based on the user's description. Return ONLY the .game code block, nothing else.

GAME syntax:
component Name {
  canvas(width, height)
  tint(r, g, b)           // RGB color (0-1 each)
  glow(intensity)         // 0-10
  opacity(value)          // 0-1
  palette(name)           // named color palette
  radius(r)              // 0-1
  scale(s)               // 0-5
  speed(s)               // 0-20
  warp(amount)           // spatial distortion
  fbm(octaves)           // fractal noise layers 1-8
  polar()                // polar coordinate mode
  simplex()              // simplex noise base
  memory(decay)          // frame persistence 0-1
  resonate(freq, amp)    // oscillation
  arc(start, end)        // arc angles in radians
  vignette(strength)     // edge darkening 0-1
  distort(amount)        // warping effect
}

Available palettes: fire, ocean, sunset, neon, ice, forest, aurora, ember, quantum, midnight, copper, gold, silver, arctic, tropical, volcanic, cosmic, ethereal, industrial, pastel, cyberpunk, retrowave, monochrome

Guidelines:
- PascalCase component names
- canvas(800, 600) unless shape demands otherwise
- Combine 3-6 properties for rich visuals
- palette() for complex color schemes, tint() for single colors
- warp() + fbm() for organic textures
- memory() for trails, resonate() for rhythm
- 5-15 lines is ideal`;

const FIX_SYSTEM_PROMPT = `You are a GAME DSL expert. The user will provide GAME code that failed to compile, along with the error message. Fix the code and return ONLY the corrected .game code block, nothing else. Keep the visual intent.`;

export interface AiGenerationResult {
  code: string;
  name: string;
  explanation: string;
}

interface ClaudeMessage {
  role: string;
  content: string;
}

export class AiProvider {
  private _apiKey: string | undefined;

  constructor() {
    this._apiKey = vscode.workspace
      .getConfiguration("game")
      .get<string>("ai.apiKey");
  }

  async generate(
    prompt: string,
    onChunk?: (text: string) => void
  ): Promise<AiGenerationResult> {
    const messages: ClaudeMessage[] = [{ role: "user", content: prompt }];
    const response = await this._callClaude(messages, SYSTEM_PROMPT, onChunk);
    return this._parseResponse(response);
  }

  async fixCompilationError(
    code: string,
    error: string,
    onChunk?: (text: string) => void
  ): Promise<AiGenerationResult> {
    const messages: ClaudeMessage[] = [
      {
        role: "user",
        content: `This GAME code failed to compile:\n\n\`\`\`game\n${code}\n\`\`\`\n\nError:\n${error}\n\nFix it.`,
      },
    ];
    const response = await this._callClaude(
      messages,
      FIX_SYSTEM_PROMPT,
      onChunk
    );
    return this._parseResponse(response);
  }

  private _parseResponse(response: string): AiGenerationResult {
    let code = response;
    const codeBlock = response.match(/```(?:game)?\s*\n([\s\S]*?)```/);
    if (codeBlock) {
      code = codeBlock[1].trim();
    }

    let name = "GeneratedComponent";
    const nameMatch = code.match(/component\s+(\w+)\s*\{/);
    if (nameMatch) {
      name = nameMatch[1];
    }

    let explanation = "";
    if (codeBlock) {
      const before = response.substring(0, response.indexOf("```")).trim();
      const after = response
        .substring(response.lastIndexOf("```") + 3)
        .trim();
      explanation = [before, after].filter(Boolean).join("\n");
    }

    return { code, name, explanation };
  }

  private async _ensureApiKey(): Promise<string> {
    if (this._apiKey) return this._apiKey;

    const key = await vscode.window.showInputBox({
      prompt: "Enter your Anthropic API key for GAME AI generation",
      placeHolder: "sk-ant-...",
      password: true,
      ignoreFocusOut: true,
    });

    if (!key) {
      throw new Error(
        'API key required. Set it in Settings > GAME > AI: Api Key'
      );
    }

    this._apiKey = key;
    await vscode.workspace
      .getConfiguration("game")
      .update("ai.apiKey", key, vscode.ConfigurationTarget.Global);
    return key;
  }

  private async _callClaude(
    messages: ClaudeMessage[],
    system: string,
    onChunk?: (text: string) => void
  ): Promise<string> {
    const apiKey = await this._ensureApiKey();
    const config = vscode.workspace.getConfiguration("game");
    const model = config.get<string>("ai.model", "claude-sonnet-4-20250514");

    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      stream: true,
      messages,
    });

    return new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        },
        (res) => {
          let fullText = "";
          let buffer = "";

          if (res.statusCode === 401) {
            this._apiKey = undefined;
            reject(new Error("Invalid API key. Check your Anthropic API key."));
            return;
          }
          if (res.statusCode === 429) {
            reject(new Error("Rate limited. Wait a moment and try again."));
            return;
          }
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            let errBody = "";
            res.on("data", (c: Buffer) => { errBody += c.toString(); });
            res.on("end", () => {
              let msg = `API error ${res.statusCode}`;
              try {
                const p = JSON.parse(errBody);
                if (p.error?.message) msg = p.error.message;
              } catch { /* use default */ }
              reject(new Error(msg));
            });
            return;
          }

          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const evt = JSON.parse(data);
                if (
                  evt.type === "content_block_delta" &&
                  evt.delta?.type === "text_delta"
                ) {
                  fullText += evt.delta.text;
                  onChunk?.(evt.delta.text);
                }
                if (evt.type === "error") {
                  reject(new Error(evt.error?.message || "Streaming error"));
                }
              } catch { /* skip unparseable SSE lines */ }
            }
          });

          res.on("end", () => {
            if (buffer.startsWith("data: ")) {
              const data = buffer.slice(6).trim();
              if (data && data !== "[DONE]") {
                try {
                  const evt = JSON.parse(data);
                  if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                    fullText += evt.delta.text;
                    onChunk?.(evt.delta.text);
                  }
                } catch { /* ignore */ }
              }
            }
            if (!fullText) {
              reject(new Error("No response from API"));
              return;
            }
            resolve(fullText);
          });

          res.on("error", (err) => reject(new Error(`Network: ${err.message}`)));
        }
      );

      req.on("error", (err) => {
        if (err.message.includes("ENOTFOUND") || err.message.includes("EAI_AGAIN")) {
          reject(new Error("Cannot reach api.anthropic.com. Check internet."));
        } else {
          reject(new Error(`Network: ${err.message}`));
        }
      });

      req.write(body);
      req.end();
    });
  }
}
