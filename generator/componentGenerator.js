const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Create a temporary directory for storing uploaded images
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
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
            content: "You are a Next.js component generator specialized in creating high-quality, reusable React components with TypeScript and Tailwind CSS. When given a description and optionally an image reference, you will generate a complete, well-structured component that follows best practices. Your output should include: 1. A component name (in PascalCase), 2. TypeScript interface for props, 3. The complete component code with proper imports, 4. Detailed comments explaining the component structure and functionality, 5. Tailwind CSS classes for styling. Make sure the component is responsive, accessible, and follows modern React patterns like hooks."
        },
        {
            role: 'user',
            content: []
        }
    ];

    // Add text prompt to the message
    messages[1].content.push({
        type: 'text',
        text: "Create a Next.js component based on this description: " + prompt
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
                url: "data:image/png;base64," + base64Data,
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
 * Clean up temporary files
 */
function cleanupTempFiles() {
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
    generateComponent,
    cleanupTempFiles
};
