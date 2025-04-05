const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const FormData = require('form-data');

// Create a temporary directory for storing uploaded images
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

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
                                await createComponentFile(result.componentName, result.componentCode);
                                vscode.window.showInformationMessage(`Component ${result.componentName} created successfully!`);
                            }
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                error: error.message || 'An error occurred while generating the component.'
                            });
                            vscode.window.showErrorMessage(`Error: ${error.message}`);
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

/**
 * Generate a Next.js component using OpenAI API
 * @param {string} prompt - User's description of the component
 * @param {string} imageData - Base64 encoded image data (optional)
 * @returns {Promise<Object>} - Generated component details
 */
async function generateComponent(prompt, imageData) {
    // Check if OpenAI API key is configured
    const config = vscode.workspace.getConfiguration('nextjsComponentGenerator');
    const apiKey = config.get('openaiApiKey');

    if (!apiKey) {
        // Prompt user to enter API key if not configured
        const enteredKey = await vscode.window.showInputBox({
            prompt: 'Please enter your OpenAI API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-...'
        });

        if (!enteredKey) {
            throw new Error('OpenAI API key is required to generate components.');
        }

        // Save the API key in settings
        await config.update('openaiApiKey', enteredKey, vscode.ConfigurationTarget.Global);
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
        apiKey: apiKey || config.get('openaiApiKey')
    });

    // Prepare the messages for the API call
    const messages = [
        {
            role: 'system',
            content: `You are a Next.js component generator specialized in creating high-quality, reusable React components with TypeScript and Tailwind CSS. 
            When given a description and optionally an image reference, you will generate a complete, well-structured component that follows best practices.
            
            Your output should include:
            1. A component name (in PascalCase)
            2. TypeScript interface for props
            3. The complete component code with proper imports
            4. Detailed comments explaining the component structure and functionality
            5. Tailwind CSS classes for styling
            
            Make sure the component is responsive, accessible, and follows modern React patterns like hooks.`
        },
        {
            role: 'user',
            content: []
        }
    ];

    // Add text prompt to the message
    messages[1].content.push({
        type: 'text',
        text: `Create a Next.js component based on this description: ${prompt}`
    });

    // Add image to the message if provided
    if (imageData) {
        // Extract the base64 data from the data URL
        const base64Data = imageData.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Save the image temporarily
        const imagePath = path.join(tempDir, `reference_${Date.now()}.png`);
        fs.writeFileSync(imagePath, imageBuffer);

        // Add the image to the message
        messages[1].content.push({
            type: 'image_url',
            image_url: {
                url: `data:image/png;base64,${base64Data}`,
                detail: 'high'
            }
        });
    }

    // Call the OpenAI API
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',  // Updated from deprecated gpt-4-vision-preview to gpt-4o which supports vision
        messages: messages,
        max_tokens: 4096,
        temperature: 0.7
    });

    const generatedText = response.choices[0].message.content;

    // Parse the component name and code from the response
    const componentNameMatch = generatedText.match(/```tsx\s*(?:\/\/\s*)?([A-Z][a-zA-Z0-9]*)\s*\.tsx/);
    const componentName = componentNameMatch ? componentNameMatch[1] : 'GeneratedComponent';

    // Extract the component code
    const codeMatch = generatedText.match(/```tsx\s*([\s\S]*?)```/);
    const componentCode = codeMatch ? codeMatch[1].trim() : generatedText;

    return {
        componentName,
        componentCode,
        fullResponse: generatedText
    };
}

/**
 * Create a component file in the workspace
 * @param {string} componentName - Name of the component
 * @param {string} componentCode - Generated component code
 */
async function createComponentFile(componentName, componentCode) {
    // Get the active workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open.');
    }

    // Determine the components directory
    let componentsDir;
    const rootPath = workspaceFolders[0].uri.fsPath;

    // Check for common Next.js component directories
    const possibleDirs = [
        path.join(rootPath, 'components'),
        path.join(rootPath, 'src', 'components'),
        path.join(rootPath, 'app', 'components')
    ];

    for (const dir of possibleDirs) {
        if (fs.existsSync(dir)) {
            componentsDir = dir;
            break;
        }
    }

    // If no components directory exists, ask the user where to save
    if (!componentsDir) {
        const selectedFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Components Directory'
        });

        if (!selectedFolder || selectedFolder.length === 0) {
            // Default to creating a components directory in the workspace root
            componentsDir = path.join(rootPath, 'components');
            if (!fs.existsSync(componentsDir)) {
                fs.mkdirSync(componentsDir, { recursive: true });
            }
        } else {
            componentsDir = selectedFolder[0].fsPath;
        }
    }

    // Create component directory if it doesn't exist
    const componentDir = path.join(componentsDir, componentName);
    if (!fs.existsSync(componentDir)) {
        fs.mkdirSync(componentDir, { recursive: true });
    }

    // Write the component file
    const filePath = path.join(componentDir, 'index.tsx');
    fs.writeFileSync(filePath, componentCode);

    // Open the file in the editor
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
}

/**
 * Get the HTML content for the webview
 * @param {vscode.Webview} webview - The webview
 * @param {vscode.ExtensionContext} context - The extension context
 * @returns {string} - HTML content
 */
function getWebviewContent(webview, context) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Next.js Component Generator</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
            }
            h1 {
                color: var(--vscode-editor-foreground);
                font-size: 24px;
                margin-bottom: 20px;
            }
            .input-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            textarea {
                width: 100%;
                height: 100px;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                resize: vertical;
            }
            .image-preview {
                margin-top: 10px;
                max-width: 300px;
                max-height: 300px;
                border: 1px dashed var(--vscode-input-border);
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            .image-preview img {
                max-width: 100%;
                max-height: 100%;
            }
            .image-preview-placeholder {
                padding: 40px;
                text-align: center;
                color: var(--vscode-descriptionForeground);
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                margin-right: 10px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .result {
                margin-top: 20px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 16px;
                background-color: var(--vscode-editor-background);
                white-space: pre-wrap;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
            .loading {
                display: none;
                margin-top: 20px;
                text-align: center;
                color: var(--vscode-descriptionForeground);
            }
            .checkbox-group {
                margin-top: 10px;
                display: flex;
                align-items: center;
            }
            .checkbox-group input {
                margin-right: 8px;
            }
            .error {
                color: var(--vscode-errorForeground);
                margin-top: 10px;
                padding: 8px;
                border-radius: 4px;
                background-color: var(--vscode-inputValidation-errorBackground);
                border: 1px solid var(--vscode-inputValidation-errorBorder);
            }
            .remove-image {
                position: absolute;
                top: 5px;
                right: 5px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                border: none;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Next.js Component Generator</h1>
            
            <div class="input-group">
                <label for="prompt">Describe the component you want to create:</label>
                <textarea id="prompt" placeholder="E.g., A responsive pricing card with a title, price, features list, and a call-to-action button. It should have a hover effect and support dark mode."></textarea>
            </div>
            
            <div class="input-group">
                <label>Reference Image (Optional):</label>
                <div class="image-preview" id="imagePreview">
                    <div class="image-preview-placeholder" id="imagePlaceholder">
                        Drag & drop an image here or click to upload
                    </div>
                </div>
                <input type="file" id="imageUpload" accept="image/*" style="display: none;">
            </div>
            
            <div class="checkbox-group">
                <input type="checkbox" id="createFile" checked>
                <label for="createFile">Create component file after generation</label>
            </div>
            
            <div style="margin-top: 20px;">
                <button id="generateBtn">Generate Component</button>
                <button id="clearBtn">Clear</button>
            </div>
            
            <div id="loading" class="loading">
                Generating component... This may take a moment.
            </div>
            
            <div id="error" class="error" style="display: none;"></div>
            
            <div id="result" class="result" style="display: none;"></div>
        </div>
        
        <script>
            (function() {
                const vscode = acquireVsCodeApi();
                
                // Elements
                const promptInput = document.getElementById('prompt');
                const imagePreview = document.getElementById('imagePreview');
                const imagePlaceholder = document.getElementById('imagePlaceholder');
                const imageUpload = document.getElementById('imageUpload');
                const generateBtn = document.getElementById('generateBtn');
                const clearBtn = document.getElementById('clearBtn');
                const createFileCheckbox = document.getElementById('createFile');
                const loadingEl = document.getElementById('loading');
                const resultEl = document.getElementById('result');
                const errorEl = document.getElementById('error');
                
                let imageData = null;
                
                // Handle image upload via click
                imagePreview.addEventListener('click', () => {
                    if (!imageData) {
                        imageUpload.click();
                    }
                });
                
                // Handle image upload
                imageUpload.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            imageData = e.target.result;
                            updateImagePreview();
                        };
                        reader.readAsDataURL(file);
                    }
                });
                
                // Handle drag and drop
                imagePreview.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    imagePreview.style.borderStyle = 'solid';
                });
                
                imagePreview.addEventListener('dragleave', () => {
                    imagePreview.style.borderStyle = 'dashed';
                });
                
                imagePreview.addEventListener('drop', (event) => {
                    event.preventDefault();
                    imagePreview.style.borderStyle = 'dashed';
                    
                    const file = event.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            imageData = e.target.result;
                            updateImagePreview();
                        };
                        reader.readAsDataURL(file);
                    }
                });
                
                // Update image preview
                function updateImagePreview() {
                    if (imageData) {
                        imagePlaceholder.style.display = 'none';
                        
                        // Remove existing image if any
                        const existingImg = imagePreview.querySelector('img');
                        if (existingImg) {
                            imagePreview.removeChild(existingImg);
                        }
                        
                        // Remove existing remove button if any
                        const existingBtn = imagePreview.querySelector('.remove-image');
                        if (existingBtn) {
                            imagePreview.removeChild(existingBtn);
                        }
                        
                        // Add the image
                        const img = document.createElement('img');
                        img.src = imageData;
                        imagePreview.appendChild(img);
                        
                        // Add remove button
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-image';
                        removeBtn.textContent = '×';
                        removeBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            imageData = null;
                            updateImagePreview();
                        });
                        imagePreview.appendChild(removeBtn);
                    } else {
                        imagePlaceholder.style.display = 'block';
                        
                        // Remove existing image if any
                        const existingImg = imagePreview.querySelector('img');
                        if (existingImg) {
                            imagePreview.removeChild(existingImg);
                        }
                        
                        // Remove existing remove button if any
                        const existingBtn = imagePreview.querySelector('.remove-image');
                        if (existingBtn) {
                            imagePreview.removeChild(existingBtn);
                        }
                    }
                }
                
                // Generate component
                generateBtn.addEventListener('click', () => {
                    const prompt = promptInput.value.trim();
                    if (!prompt) {
                        showError('Please provide a description for the component.');
                        return;
                    }
                    
                    // Show loading state
                    loadingEl.style.display = 'block';
                    resultEl.style.display = 'none';
                    errorEl.style.display = 'none';
                    generateBtn.disabled = true;
                    
                    // Send message to extension
                    vscode.postMessage({
                        command: 'generateComponent',
                        prompt: prompt,
                        imageData: imageData,
                        createFile: createFileCheckbox.checked
                    });
                });
                
                // Clear form
                clearBtn.addEventListener('click', () => {
                    promptInput.value = '';
                    imageData = null;
                    updateImagePreview();
                    resultEl.style.display = 'none';
                    errorEl.style.display = 'none';
                });
                
                // Handle messages from the extension
                window.addEventListener('message', (event) => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'result':
                            loadingEl.style.display = 'none';
                            generateBtn.disabled = false;
                            
                            resultEl.textContent = message.result.fullResponse;
                            resultEl.style.display = 'block';
                            break;
                            
                        case 'error':
                            loadingEl.style.display = 'none';
                            generateBtn.disabled = false;
                            showError(message.error);
                            break;
                    }
                });
                
                function showError(message) {
                    errorEl.textContent = message;
                    errorEl.style.display = 'block';
                }
            }());
        </script>
    </body>
    </html>`;
}

function deactivate() {
    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
        try {
            fs.readdirSync(tempDir).forEach(file => {
                const filePath = path.join(tempDir, file);
                fs.unlinkSync(filePath);
            });
        } catch (error) {
            console.error('Error cleaning up temporary files:', error);
        }
    }
}

module.exports = {
    activate,
    deactivate
};
