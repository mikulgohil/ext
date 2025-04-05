const vscode = require('vscode');
const path = require('path');

// Import modules
const { getWebviewContent } = require('./webview');
const { generateComponent, formatDescription, cleanupTempFiles } = require('./generator/componentGenerator');
const { createComponentFile } = require('./fileSystem/fileManager');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Next.js Component Generator is now active!');

    // Register the command to start the chat interface
    let disposable = vscode.commands.registerCommand('nextjs-component-generator.start', async function () {
        // Create and show the chat panel
        const panel = vscode.window.createWebviewPanel(
            'nextjsComponentGenerator',
            'Next.js Component Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'media'))
                ],
                retainContextWhenHidden: true
            }
        );

        // Set the HTML content for the webview
        panel.webview.html = getWebviewContent(panel.webview, context);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'generateComponent':
                        try {
                            const result = await generateComponent(message.prompt, message.imageData);
                            panel.webview.postMessage({ command: 'result', result });

                            // Create the component file if requested
                            if (message.createFile && result.componentCode) {
                                const successMessage = await createComponentFile(
                                    result.componentName,
                                    result.componentCode,
                                    message.outputFolder,
                                    message.createStorybook,
                                    message.createMockData
                                );
                                vscode.window.showInformationMessage(successMessage);
                            }
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                error: error.message || 'An error occurred while generating the component.'
                            });
                            vscode.window.showErrorMessage(`Error: ${error.message}`);
                        }
                        break;

                    case 'formatDescription':
                        try {
                            const formattedDescription = await formatDescription(message.description);
                            panel.webview.postMessage({
                                command: 'descriptionFormatted',
                                formattedDescription
                            });
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                error: error.message || 'An error occurred while formatting the description.'
                            });
                            vscode.window.showErrorMessage(`Error: ${error.message}`);
                        }
                        break;

                    case 'browseFolder':
                        try {
                            const selectedFolder = await vscode.window.showOpenDialog({
                                canSelectFiles: false,
                                canSelectFolders: true,
                                canSelectMany: false,
                                openLabel: 'Select Output Folder'
                            });

                            if (selectedFolder && selectedFolder.length > 0) {
                                panel.webview.postMessage({
                                    command: 'folderSelected',
                                    folderPath: selectedFolder[0].fsPath
                                });
                            }
                        } catch (error) {
                            console.error('Error selecting folder:', error);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

function deactivate() {
    // Clean up temporary files
    cleanupTempFiles();
}

module.exports = {
    activate,
    deactivate
};
