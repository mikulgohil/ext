# Next.js Component Generator - Development Guide

This guide will help you get started with developing the Next.js Component Generator extension.

## Development Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open the project in VS Code
4. Press `F5` to start debugging the extension in a new Extension Development Host window

## Project Structure

- `extension.js`: Main extension code
- `package.json`: Extension manifest
- `test/`: Test files
- `media/`: Media files for the extension

## Making Changes

1. Make changes to the code
2. Press `F5` to debug the extension
3. Use the command "Next.js Component Generator: Start Chat" to test your changes

## Adding Features

To add new features:

1. Update the extension code in `extension.js`
2. Add any new dependencies to `package.json`
3. Update the README.md with documentation for the new features
4. Add tests for the new features

## Packaging the Extension

To package the extension for distribution:

1. Update the version number in `package.json`
2. Run `npm run package` to create a VSIX file
3. The VSIX file can be installed in VS Code using the "Install from VSIX" command

## Publishing the Extension

To publish the extension to the VS Code Marketplace:

1. Make sure you have a Personal Access Token from Azure DevOps
2. Run `vsce login <publisher>` and enter your token
3. Run `npm run publish` to publish the extension

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
