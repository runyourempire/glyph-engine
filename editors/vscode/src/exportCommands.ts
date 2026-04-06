import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface CompileResult {
  js: string;
  name: string;
  tag: string;
}

async function compileCurrentFile(): Promise<CompileResult | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'glyph') {
    vscode.window.showWarningMessage('Open a .glyph file first');
    return null;
  }

  const config = vscode.workspace.getConfiguration('glyph');
  const serverPath = config.get<string>('serverPath', 'glyph');
  const code = editor.document.getText();

  const tmp = os.tmpdir();
  const inputPath = path.join(tmp, `glyph-export-${process.pid}.glyph`);
  const outputDir = path.join(tmp, `glyph-export-out-${process.pid}`);

  fs.writeFileSync(inputPath, code);
  fs.mkdirSync(outputDir, { recursive: true });

  // Clean stale output before compile
  const oldFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.js') || f.endsWith('.d.ts'));
  oldFiles.forEach(f => fs.unlinkSync(path.join(outputDir, f)));

  return new Promise((resolve) => {
    cp.exec(`"${serverPath}" build "${inputPath}" -o "${outputDir}"`, { timeout: 10000 }, (err, _stdout, stderr) => {
      if (err) {
        let msg = stderr || err.message;
        if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('not recognized')) {
          msg = 'GAME compiler not found. Set glyph.serverPath in VS Code settings.';
        }
        vscode.window.showErrorMessage(`Compile failed: ${msg}`);
        resolve(null);
        return;
      }
      const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.js'));
      if (files.length === 0) {
        vscode.window.showErrorMessage('No output generated');
        resolve(null);
        return;
      }
      const jsFile = files[0];
      const js = fs.readFileSync(path.join(outputDir, jsFile), 'utf-8');
      const name = jsFile.replace('.js', '');
      const tag = 'glyph-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      resolve({ js, name, tag });
    });
  });
}

export function registerExportCommands(context: vscode.ExtensionContext): void {

  // Copy JS to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand('glyph.exportCopyJs', async () => {
      const result = await compileCurrentFile();
      if (!result) return;
      await vscode.env.clipboard.writeText(result.js);
      vscode.window.showInformationMessage(`Copied ${result.name}.js to clipboard (${Math.round(result.js.length / 1024)}KB)`);
    })
  );

  // Copy HTML embed snippet
  context.subscriptions.push(
    vscode.commands.registerCommand('glyph.exportCopyHtml', async () => {
      const result = await compileCurrentFile();
      if (!result) return;
      const html = `<script>\n${result.js}\n</script>\n<${result.tag}></${result.tag}>`;
      await vscode.env.clipboard.writeText(html);
      vscode.window.showInformationMessage(`Copied HTML embed for <${result.tag}> to clipboard`);
    })
  );

  // Copy React usage
  context.subscriptions.push(
    vscode.commands.registerCommand('glyph.exportCopyReact', async () => {
      const result = await compileCurrentFile();
      if (!result) return;
      const pascal = result.name.split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join('');
      const react = `// 1. Add ${result.name}.js to your public/ directory or import it\nimport './${result.name}.js';\n\n// 2. Use the Web Component in JSX\nexport function ${pascal}() {\n  return <${result.tag}></${result.tag}>;\n}`;
      await vscode.env.clipboard.writeText(react);
      vscode.window.showInformationMessage(`Copied React usage for <${result.tag}> to clipboard`);
    })
  );

  // Save JS file
  context.subscriptions.push(
    vscode.commands.registerCommand('glyph.exportSaveJs', async () => {
      const result = await compileCurrentFile();
      if (!result) return;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(result.name + '.js'),
        filters: { 'JavaScript': ['js'] },
      });
      if (uri) {
        fs.writeFileSync(uri.fsPath, result.js);
        vscode.window.showInformationMessage(`Saved ${path.basename(uri.fsPath)}`);
      }
    })
  );

  // Save standalone HTML
  context.subscriptions.push(
    vscode.commands.registerCommand('glyph.exportSaveHtml', async () => {
      const result = await compileCurrentFile();
      if (!result) return;
      const html = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${result.name}</title>\n<style>html,body{margin:0;height:100%;background:#0a0a0a}${result.tag}{display:block;width:100%;height:100%}</style>\n</head>\n<body>\n<script>\n${result.js}\n</script>\n<${result.tag}></${result.tag}>\n</body>\n</html>`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(result.name + '.html'),
        filters: { 'HTML': ['html'] },
      });
      if (uri) {
        fs.writeFileSync(uri.fsPath, html);
        vscode.window.showInformationMessage(`Saved ${path.basename(uri.fsPath)}`);
      }
    })
  );

  // Export menu (quick pick)
  context.subscriptions.push(
    vscode.commands.registerCommand('glyph.export', async () => {
      const choice = await vscode.window.showQuickPick([
        { label: '$(clippy) Copy JS', description: 'Web Component JavaScript to clipboard', command: 'glyph.exportCopyJs' },
        { label: '$(code) Copy HTML', description: 'Script tag + element to clipboard', command: 'glyph.exportCopyHtml' },
        { label: '$(symbol-event) Copy React', description: 'React component usage to clipboard', command: 'glyph.exportCopyReact' },
        { label: '$(save) Save JS File', description: 'Save compiled .js to disk', command: 'glyph.exportSaveJs' },
        { label: '$(file-code) Save HTML Page', description: 'Save standalone HTML page', command: 'glyph.exportSaveHtml' },
      ], { placeHolder: 'Export GAME component as...' });
      if (choice) {
        vscode.commands.executeCommand(choice.command);
      }
    })
  );
}
