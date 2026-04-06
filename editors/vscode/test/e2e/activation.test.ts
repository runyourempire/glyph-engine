import { browser } from "@wdio/globals";

describe("Extension Activation", () => {
  it("activates without error", async () => {
    const isActive = (await browser.executeWorkbench(async (vscode) => {
      const ext = vscode.extensions.getExtension("4da-systems.glyph-language");
      if (!ext) return false;
      await ext.activate();
      return ext.isActive;
    })) as boolean;
    expect(isActive).toBe(true);
  });

  it("registers all commands", async () => {
    const commands = (await browser.executeWorkbench(async (vscode) => {
      const all = await vscode.commands.getCommands(true);
      return all.filter((c: string) => c.startsWith("glyph."));
    })) as string[];

    const expected = [
      "glyph.openPreview",
      "glyph.export",
      "glyph.exportCopyJs",
      "glyph.exportCopyHtml",
      "glyph.exportCopyReact",
      "glyph.exportSaveJs",
      "glyph.exportSaveHtml",
      "glyph.openGallery",
      "glyph.openAi",
    ];

    for (const cmd of expected) {
      expect(commands).toContain(cmd);
    }
  });

  it("reads glyph.serverPath setting", async () => {
    const serverPath = (await browser.executeWorkbench(async (vscode) => {
      return vscode.workspace.getConfiguration("glyph").get("serverPath");
    })) as string;
    expect(serverPath).toBeTruthy();
    expect(typeof serverPath).toBe("string");
  });
});
