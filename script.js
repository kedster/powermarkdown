// Configuration for worker endpoints
const CONFIG = {
    JWT_WORKER_URL: 'https://markdowngpt-worker-jwt.sethkeddy.workers.dev', // Replace with your JWT worker URL
    AI_WORKER_URL: 'https://markdowngpt-worker-ai.sethkeddy.workers.dev',   // Replace with your AI worker URL
    ENABLE_JWT: false // Set to false to disable JWT authentication
};

// In-memory storage for the session
let editorState = {
    content: '',
    currentFormat: null,
    sessionId: null,
    token: null,
    tokenExpiry: null
};

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const stats = document.getElementById('stats');

// Configure marked with syntax highlighting
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) {}
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
});

// Initialize session on page load
document.addEventListener('DOMContentLoaded', async function() {
    if (CONFIG.ENABLE_JWT) {
        await initializeSession();
    }
    
    // Set default content
    const defaultContent = getDefaultContent();
    editor.value = defaultContent;
    updatePreview(defaultContent);
    updateStats(defaultContent);
});

// Initialize session with JWT worker
async function initializeSession() {
    try {
        // Create session
        const sessionResponse = await fetch(`${CONFIG.JWT_WORKER_URL}/session/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userAgent: navigator.userAgent,
                ipAddress: 'client' // Will be detected by worker
            })
        });

        if (!sessionResponse.ok) {
            throw new Error('Failed to create session');
        }

        const sessionData = await sessionResponse.json();
        editorState.sessionId = sessionData.sessionId;

        // Generate JWT token
        const tokenResponse = await fetch(`${CONFIG.JWT_WORKER_URL}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId: editorState.sessionId,
                userAgent: navigator.userAgent,
                ipAddress: 'client'
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to generate token');
        }

        const tokenData = await tokenResponse.json();
        editorState.token = tokenData.token;
        editorState.tokenExpiry = Date.now() + (tokenData.expiresIn * 1000);

        console.log('Session initialized successfully');
    } catch (error) {
        console.error('Session initialization failed:', error);
        // Continue without JWT if initialization fails
        CONFIG.ENABLE_JWT = false;
    }
}

// Check if token needs refresh
async function ensureValidToken() {
    if (!CONFIG.ENABLE_JWT || !editorState.token) {
        return true;
    }

    // Check if token expires within 5 minutes
    if (editorState.tokenExpiry && (editorState.tokenExpiry - Date.now()) < 300000) {
        try {
            const refreshResponse = await fetch(`${CONFIG.JWT_WORKER_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: editorState.token
                })
            });

            if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();
                editorState.token = refreshData.token;
                editorState.tokenExpiry = Date.now() + (refreshData.expiresIn * 1000);
                console.log('Token refreshed successfully');
            } else {
                console.warn('Token refresh failed');
                return false;
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            return false;
        }
    }

    return true;
}

// Real-time preview update
editor.addEventListener('input', function() {
    const content = editor.value;
    editorState.content = content;
    updatePreview(content);
    updateStats(content);
});

function updatePreview(content) {
    try {
        preview.innerHTML = marked.parse(content);
    } catch (error) {
        preview.innerHTML = '<p style="color: red;">Error parsing markdown</p>';
    }
}

function updateStats(content) {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    const lines = content.split('\n').length;
    stats.textContent = `Words: ${words} | Characters: ${chars} | Lines: ${lines}`;
}

function insertFormat(before, after, placeholder) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    const textToInsert = selectedText || placeholder;
    const newText = before + textToInsert + after;
    
    editor.value = editor.value.substring(0, start) + newText + editor.value.substring(end);
    editor.focus();
    
    if (!selectedText) {
        editor.setSelectionRange(start + before.length, start + before.length + placeholder.length);
    } else {
        editor.setSelectionRange(start + newText.length, start + newText.length);
    }
    
    editor.dispatchEvent(new Event('input'));
}

// Enhanced auto-format with AI processing
async function autoFormat() {
    const content = editor.value.trim();
    
    if (!content) {
        alert('Please enter some text to format.');
        return;
    }

    if (content.length > 1000) {
        alert('Text is too long. Please limit to 1000 characters.');
        return;
    }

    try {
        // Show loading state
        const originalButtonText = event.target.textContent;
        event.target.textContent = '🔄 Processing...';
        event.target.disabled = true;

        // Ensure we have a valid token
        const tokenValid = await ensureValidToken();
        if (!tokenValid && CONFIG.ENABLE_JWT) {
            throw new Error('Authentication failed');
        }

        // Determine format based on content analysis
        let detectedFormat = 'general';
        if (content.includes('function') || content.includes('const') || content.includes('class')) {
            detectedFormat = 'dev-article';
        } else if (content.toLowerCase().includes('step') || content.toLowerCase().includes('tutorial')) {
            detectedFormat = 'tutorial';
        } else if (content.includes('please') || content.includes('can you') || content.includes('prompt')) {
            detectedFormat = 'chatgpt-prompt';
        }

        // Call AI worker
        const response = await fetch(`${CONFIG.AI_WORKER_URL}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(CONFIG.ENABLE_JWT && editorState.token ? { 'Authorization': `Bearer ${editorState.token}` } : {})
            },
            body: JSON.stringify({
                text: content,
                prompt: 'Format this text for better readability and structure',
                format: detectedFormat,
                sessionId: editorState.sessionId || 'anonymous',
                token: editorState.token
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Processing failed');
        }

        const result = await response.json();
        
        if (result.success) {
            editor.value = result.processedText;
            editor.dispatchEvent(new Event('input'));
            
            // Show success message
            showNotification('✨ Auto-formatting completed!', 'success');
        } else {
            throw new Error(result.error || 'Processing failed');
        }

    } catch (error) {
        console.error('Auto-format error:', error);
        
        if (error.message.includes('Rate limit')) {
            showNotification('⏱️ Rate limit exceeded. Please wait before trying again.', 'warning');
        } else if (error.message.includes('Authentication')) {
            showNotification('🔐 Authentication failed. Please refresh the page.', 'error');
        } else {
            showNotification(`❌ Error: ${error.message}`, 'error');
            
            // Fallback to local formatting
            autoFormatLocal();
        }
    } finally {
        // Restore button state
        const button = document.querySelector('button[onclick="autoFormat()"]');
        if (button) {
            button.textContent = originalButtonText || '🪄 Auto Format';
            button.disabled = false;
        }
    }
}

// Local fallback formatting
function autoFormatLocal() {
    let content = editor.value;
    
    // Smart auto-formatting based on content analysis
    if (content.includes('function') || content.includes('const') || content.includes('class')) {
        content = formatAsCode(content);
    } else if (content.includes('step') || content.includes('tutorial')) {
        content = formatAsTutorial(content);
    } else {
        content = formatAsArticle(content);
    }
    
    editor.value = content;
    editor.dispatchEvent(new Event('input'));
    showNotification('📝 Local formatting applied', 'info');
}

// Process specific format with AI
async function processWithAI(format, customPrompt = null) {
    const content = editor.value.trim();
    
    if (!content) {
        alert('Please enter some text to process.');
        return;
    }

    if (content.length > 1000) {
        alert('Text is too long. Please limit to 1000 characters.');
        return;
    }

    try {
        // Ensure we have a valid token
        const tokenValid = await ensureValidToken();
        if (!tokenValid && CONFIG.ENABLE_JWT) {
            throw new Error('Authentication failed');
        }

        const prompts = {
            'dev-article': 'Transform this into a well-structured development article with clear sections, proper headings, and code examples where appropriate.',
            'tutorial': 'Format this as a step-by-step tutorial with numbered sections and clear instructions.',
            'chatgpt-prompt': 'Reformat this as a clear, structured prompt for ChatGPT with specific requirements and context.',
            'readme': 'Format this as a professional README document with sections for installation, usage, and examples.'
        };

        const prompt = customPrompt || prompts[format] || 'Improve the formatting and structure of this text.';

        const response = await fetch(`${CONFIG.AI_WORKER_URL}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(CONFIG.ENABLE_JWT && editorState.token ? { 'Authorization': `Bearer ${editorState.token}` } : {})
            },
            body: JSON.stringify({
                text: content,
                prompt: prompt,
                format: format,
                sessionId: editorState.sessionId || 'anonymous',
                token: editorState.token
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Processing failed');
        }

        const result = await response.json();
        
        if (result.success) {
            editor.value = result.processedText;
            editor.dispatchEvent(new Event('input'));
            showNotification(`✨ ${format} formatting completed!`, 'success');
        } else {
            throw new Error(result.error || 'Processing failed');
        }

    } catch (error) {
        console.error('AI Processing error:', error);
        showNotification(`❌ Error: ${error.message}`, 'error');
    }
}

function formatAsCode(content) {
    // Wrap code-like content in code blocks
    const lines = content.split('\n');
    let formatted = [];
    let inCodeBlock = false;
    
    for (let line of lines) {
        if (line.match(/^(function|const|let|var|class|import|export)/)) {
            if (!inCodeBlock) {
                formatted.push('```javascript');
                inCodeBlock = true;
            }
            formatted.push(line);
        } else if (inCodeBlock && line.trim() === '') {
            formatted.push(line);
        } else if (inCodeBlock) {
            formatted.push('```');
            formatted.push('');
            formatted.push(line);
            inCodeBlock = false;
        } else {
            formatted.push(line);
        }
    }
    
    if (inCodeBlock) {
        formatted.push('```');
    }
    
    return formatted.join('\n');
}

function formatAsTutorial(content) {
    const lines = content.split('\n');
    let formatted = [];
    let stepCounter = 1;
    
    for (let line of lines) {
        if (line.toLowerCase().includes('step') && !line.startsWith('#')) {
            formatted.push(`## Step ${stepCounter}: ${line.replace(/step\s*\d*:?\s*/i, '')}`);
            stepCounter++;
        } else {
            formatted.push(line);
        }
    }
    
    return formatted.join('\n');
}

function formatAsArticle(content) {
    const lines = content.split('\n');
    let formatted = [];
    
    for (let line of lines) {
        // Auto-detect headings
        if (line.length > 0 && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*')) {
            if (line.length < 60 && !line.includes('.') && !line.includes(',')) {
                // Likely a heading
                formatted.push(`## ${line}`);
            } else {
                formatted.push(line);
            }
        } else {
            formatted.push(line);
        }
    }
    
    return formatted.join('\n');
}

function optimizeForDevTo() {
    let content = editor.value;
    
    // Add dev.to specific formatting
    if (!content.includes('---')) {
        const frontMatter = `---
title: "Your Title Here"
published: false
description: "Brief description"
tags: [javascript, tutorial, webdev]
canonical_url: 
cover_image: 
---

`;
        content = frontMatter + content;
    }
    
    // Optimize code blocks for dev.to
    content = content.replace(/```(\w+)/g, '```$1');
    
    editor.value = content;
    editor.dispatchEvent(new Event('input'));
}

function optimizeForChatGPT() {
    let content = editor.value;
    
    // Format for clear ChatGPT communication
    const lines = content.split('\n');
    let formatted = [];
    
    for (let line of lines) {
        if (line.startsWith('Q:') || line.startsWith('Question:')) {
            formatted.push(`**${line}**`);
        } else if (line.startsWith('A:') || line.startsWith('Answer:')) {
            formatted.push(`**${line}**`);
        } else if (line.includes('please') || line.includes('can you')) {
            formatted.push(`> ${line}`);
        } else {
            formatted.push(line);
        }
    }
    
    editor.value = formatted.join('\n');
    editor.dispatchEvent(new Event('input'));
}

function applyFormat(element, format) {
    // Remove active class from all buttons
    document.querySelectorAll('.format-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    
    editorState.currentFormat = format;
    
    // Check if we should use AI processing or templates
    const content = editor.value.trim();
    if (content && content.length <= 1000) {
        // Use AI processing for existing content
        processWithAI(format);
    } else {
        // Use templates for empty content or very long content
        useTemplate(format);
    }
}

function useTemplate(format) {
    const templates = {
        'dev-article': `# Your Article Title

Brief introduction to your topic...

## Introduction

Explain what you'll cover in this article.

## Main Content

### Subsection 1

Your content here...

\`\`\`javascript
// Code example
const example = "Hello World";
console.log(example);
\`\`\`

### Subsection 2

More content...

## Conclusion

Wrap up your thoughts...

---

Thanks for reading! Follow me for more content.`,

        'tutorial': `# Step-by-Step Tutorial: [Topic]

## Prerequisites

- Requirement 1
- Requirement 2
- Requirement 3

## Step 1: Setup

First, let's set up our environment...

\`\`\`bash
npm install package-name
\`\`\`

## Step 2: Configuration

Next, we'll configure...

## Step 3: Implementation

Now let's implement the solution...

## Step 4: Testing

Finally, let's test our implementation...

## Conclusion

You've successfully learned how to...`,

        'chatgpt-prompt': `**Context:** Provide clear context about what you need

**Task:** Clearly state what you want ChatGPT to do

**Requirements:**
- Specific requirement 1
- Specific requirement 2
- Output format needed

**Example:** If helpful, provide an example of what you're looking for

**Additional Notes:** Any extra context or constraints`,

        'readme': `# Project Name

Brief description of what this project does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`javascript
const project = require('project-name');
project.doSomething();
\`\`\`

## API Reference

### Method 1

Description of method...

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.`
    };
    
    if (templates[format]) {
        editor.value = templates[format];
        editor.dispatchEvent(new Event('input'));
    }
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
    `;

    // Set background color based on type
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);

    // Click to dismiss
    notification.addEventListener('click', () => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    });
}

function toggleExportMenu() {
    const dropdown = document.getElementById('exportDropdown');
    dropdown.classList.toggle('show');
}

function exportMarkdown() {
    const content = editor.value;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
    toggleExportMenu();
}

function exportHTML() {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Markdown Document</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    </style>
</head>
<body>
${preview.innerHTML}
</body>
</html>`;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(url);
    toggleExportMenu();
}

function copyToClipboard() {
    navigator.clipboard.writeText(editor.value).then(() => {
        showNotification('📋 Markdown copied to clipboard!', 'success');
    });
    toggleExportMenu();
}

// Close export menu when clicking outside
document.addEventListener('click', function(event) {
    const exportMenu = document.querySelector('.export-menu');
    if (!exportMenu.contains(event.target)) {
        document.getElementById('exportDropdown').classList.remove('show');
    }
});

function getDefaultContent() {
    return `# Welcome to Markdown Power Surgeon! ⚡

This editor is specifically optimized for **dev.to** and **ChatGPT** formatting with intelligent AI-powered auto-formatting capabilities.

## ✨ Key Features

- **Live Preview**: See your markdown rendered in real-time
- **AI-Powered Auto-Format**: Intelligent formatting using Cloudflare AI
- **Platform Optimization**: One-click formatting for dev.to and ChatGPT
- **Export Options**: Save as Markdown, HTML, or copy to clipboard
- **Syntax Highlighting**: Code blocks with proper highlighting
- **Secure Sessions**: JWT-based authentication and rate limiting

## 🚀 Quick Start

1. Start typing in the editor
2. Use toolbar buttons for quick formatting
3. Try the **Auto Format** button to see AI-powered intelligent formatting
4. Use **dev.to Style** for blog posts
5. Use **ChatGPT Style** for clear prompts

## 💡 Pro Tips

- The AI detects code and automatically wraps it in code blocks
- Tutorial content gets automatically numbered steps
- Articles get smart heading detection
- All formatting works great with dev.to and ChatGPT!
- Rate limiting ensures fair usage for all users

\`\`\`javascript
// Code example with syntax highlighting
const markdownSurgeon = {
    power: 'maximum',
    features: ['ai-format', 'live-preview', 'export', 'jwt-auth'],
    optimizedFor: ['dev.to', 'ChatGPT'],
    aiPowered: true
};

console.log('Ready to create amazing content with AI! 🎉');
\`\`\`

> Try the different formatting templates below to see the AI magic! ✨

**Note**: AI processing is limited to 1000 characters. For longer content, templates will be used instead.`;
}