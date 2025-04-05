const vscode = require('vscode');
const path = require('path');

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
    <title>Next.js Component Generator (Powered by Anthropic)</title>
    <style>
        body { font-family: system-ui; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        .input-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        textarea { width: 100%; height: 100px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
        button { background-color: #0078d4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background-color: #005a9e; }
        .checkbox-group { margin-top: 10px; display: flex; align-items: center; }
        .checkbox-group input { margin-right: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Next.js Component Generator (Powered by Anthropic)</h1>
        
        <div class="input-group">
            <label for="prompt">Describe the component you want to create:</label>
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <textarea id="prompt" placeholder="E.g., A responsive pricing card with a title, price, features list, and a call-to-action button." style="flex-grow: 1;"></textarea>
                <button id="formatDescriptionBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition-colors" style="min-width: 120px; height: 40px; align-self: flex-start;">
                    <span class="flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" />
                        </svg>
                        Format
                    </span>
                </button>
            </div>
        </div>
        
        <div class="input-group">
            <label for="imageUpload">Upload reference image (optional):</label>
            <input type="file" id="imageUpload" accept="image/*">
            <div id="imagePreview" style="margin-top: 10px; display: none;">
                <img id="previewImg" style="max-width: 100%; max-height: 200px; border: 1px solid #ccc; border-radius: 4px;">
                <button id="removeImageBtn" style="margin-top: 5px;">Remove Image</button>
            </div>
        </div>
        
        <div class="checkbox-group">
            <input type="checkbox" id="createFile" checked>
            <label for="createFile">Create component file after generation</label>
        </div>
        
        <div id="fileOptions" style="margin-top: 15px;">
            <div class="checkbox-group">
                <input type="checkbox" id="createStorybook">
                <label for="createStorybook">Generate Storybook file</label>
            </div>
            
            <div class="checkbox-group">
                <input type="checkbox" id="createMockData">
                <label for="createMockData">Generate mock data file</label>
            </div>
        </div>
        
        <div class="input-group">
            <label for="outputFolder">Output folder:</label>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="outputFolder" placeholder="Select output folder" style="flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" readonly>
                <button id="browseFolderBtn">Browse</button>
            </div>
        </div>
        
        <div style="margin-top: 20px;">
            <button id="generateBtn">Generate Component</button>
            <button id="clearBtn">Clear</button>
        </div>
        
        <div id="result" style="margin-top: 20px; white-space: pre-wrap; display: none;"></div>
    </div>
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            
            // Elements
            const promptInput = document.getElementById('prompt');
            const formatDescriptionBtn = document.getElementById('formatDescriptionBtn');
            const imageUploadInput = document.getElementById('imageUpload');
            const imagePreviewEl = document.getElementById('imagePreview');
            const previewImgEl = document.getElementById('previewImg');
            const removeImageBtn = document.getElementById('removeImageBtn');
            const outputFolderInput = document.getElementById('outputFolder');
            const browseFolderBtn = document.getElementById('browseFolderBtn');
            const generateBtn = document.getElementById('generateBtn');
            const clearBtn = document.getElementById('clearBtn');
            const createFileCheckbox = document.getElementById('createFile');
            const fileOptionsEl = document.getElementById('fileOptions');
            const createStorybookCheckbox = document.getElementById('createStorybook');
            const createMockDataCheckbox = document.getElementById('createMockData');
            const resultEl = document.getElementById('result');
            
            // Image data storage
            let imageData = null;
            
            // Handle image upload
            imageUploadInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imageData = e.target.result; // Store base64 data
                        previewImgEl.src = imageData;
                        imagePreviewEl.style.display = 'block';
                    };
                    reader.readAsDataURL(file);
                }
            });
            
            // Remove uploaded image
            removeImageBtn.addEventListener('click', () => {
                imageData = null;
                imageUploadInput.value = '';
                imagePreviewEl.style.display = 'none';
            });
            
            // Browse for output folder
            browseFolderBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'browseFolder'
                });
            });
            
            // Toggle file options visibility
            createFileCheckbox.addEventListener('change', () => {
                fileOptionsEl.style.display = createFileCheckbox.checked ? 'block' : 'none';
            });
            
            // Generate component
            generateBtn.addEventListener('click', () => {
                const prompt = promptInput.value.trim();
                if (!prompt) {
                    alert('Please provide a description for the component.');
                    return;
                }
                
                // Send message to extension
                vscode.postMessage({
                    command: 'generateComponent',
                    prompt: prompt,
                    imageData: imageData,
                    createFile: createFileCheckbox.checked,
                    createStorybook: createStorybookCheckbox.checked,
                    createMockData: createMockDataCheckbox.checked,
                    outputFolder: outputFolderInput.value || null
                });
                
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generating...';
            });
            
            // Clear form
            clearBtn.addEventListener('click', () => {
                promptInput.value = '';
                imageData = null;
                imageUploadInput.value = '';
                imagePreviewEl.style.display = 'none';
                resultEl.style.display = 'none';
            });
            
            // Format description button
            formatDescriptionBtn.addEventListener('click', () => {
                const description = promptInput.value.trim();
                if (!description) {
                    alert('Please enter a description to format.');
                    return;
                }
                
                // Disable button and show loading state
                formatDescriptionBtn.disabled = true;
                formatDescriptionBtn.innerHTML = '<span class="flex items-center justify-center"><svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Formatting...</span>';
                
                // Send message to extension
                vscode.postMessage({
                    command: 'formatDescription',
                    description: description
                });
            });
            
            // Handle messages from the extension
            window.addEventListener('message', (event) => {
                const message = event.data;
                
                switch (message.command) {
                    case 'result':
                        generateBtn.disabled = false;
                        generateBtn.textContent = 'Generate Component';
                        
                        // Show result
                        resultEl.textContent = message.result.fullResponse;
                        resultEl.style.display = 'block';
                        break;
                        
                    case 'error':
                        generateBtn.disabled = false;
                        generateBtn.textContent = 'Generate Component';
                        alert('Error: ' + message.error);
                        break;
                        
                    case 'folderSelected':
                        outputFolderInput.value = message.folderPath;
                        break;
                        
                    case 'descriptionFormatted':
                        // Reset button state
                        formatDescriptionBtn.disabled = false;
                        formatDescriptionBtn.innerHTML = '<span class="flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" /></svg>Format</span>';
                        
                        // Update the description textarea with the formatted text
                        promptInput.value = message.formattedDescription;
                        break;
                }
            });
        }());
    </script>
</body>
</html>`;
}

module.exports = {
    getWebviewContent
};
