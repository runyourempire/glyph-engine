import { browser } from "@wdio/globals";
import path from "path";

const FIXTURE = path.join(__dirname, "../fixtures/hello.glyph");

describe("Extension Commands", () => {
  before(async () => {
    // Open a .glyph file first
    await browser.executeWorkbench(async (vscode, filePath) => {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(filePath)
      );
      await vscode.window.showTextDocument(doc);
    }, FIXTURE);
    await browser.pause(2000);
  });

  it("glyph.openPreview executes without error", async () => {
    const result = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand("glyph.openPreview");
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: String(e) };
      }
    });
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("glyph.openGallery executes without error", async () => {
    const result = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand("glyph.openGallery");
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: String(e) };
      }
    });
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("glyph.openAi executes without error", async () => {
    const result = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand("glyph.openAi");
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: String(e) };
      }
    });
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("glyph.exportCopyJs executes without error", async () => {
    // Need active .glyph editor for export
    await browser.executeWorkbench(async (vscode, filePath) => {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(filePath)
      );
      await vscode.window.showTextDocument(doc);
    }, FIXTURE);
    await browser.pause(1000);

    const result = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand("glyph.exportCopyJs");
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: String(e) };
      }
    });
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});
