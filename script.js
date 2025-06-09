        // Configuration
        const WORKER_URL = 'https://your-worker.your-subdomain.workers.dev'; // Replace with your worker URL
        const MAX_CHARS = 1000;
        
        // State management
        let sessionId = generateSessionId();
        let currentProcessing = false;

        // DOM elements
        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const stats = document.getElementById('stats');
        const charCounter = document.getElementById('charCounter');
        const errorMessage = document.getElementById('errorMessage');

        // AI Processing prompts mapped to each format
        const prompts = {
            'professional-email': 'Transform the following text into a professional business email with proper greeting, body, and closing:',
            'blog-post': 'Convert the following text into an engaging blog post with a compelling title, introduction, main content with subheadings, and conclusion:',
            'technical-summary': 'Create a concise technical summary from the following text, organizing it with clear headings, key points, and technical details:',
            'creative-writing': 'Transform the following text into creative, engaging content with vivid descriptions, storytelling elements, and compelling narrative:',
            'social-media': 'Rewrite the following text for social media platforms, making it engaging, shareable, and optimized for social engagement with relevant hashtags:',
            'documentation': 'Format the following text as clear, professional documentation with proper structure, headings, and easy-to-follow formatting:'
        };

        // Initialize
        function generateSessionId() {
            return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        }

        // Configure marked for preview
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

        // Event listeners
        editor.addEventListener('input', function() {
            const content = editor.value;
            updateStats(content);
            updateCharCounter(content);
        });

        function updateStats(content) {
            const chars = content.length;
            stats.textContent = `Characters: ${chars} / ${MAX_CHARS}`;
        }

        function updateCharCounter(content) {
            const chars = content.length;
            charCounter.textContent = `${chars}/${MAX_CHARS}`;
            
            if (chars > MAX_CHARS) {
                charCounter.classList.add('warning');
            } else {
                charCounter.classList.remove('warning');
            }
        }

        function updatePreview(content) {
            try {
                preview.innerHTML = marked.parse(content);
            } catch (error) {
                preview.innerHTML = '<p style="color: red;">Error rendering content</p>';
            }
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
            
            updateStats(editor.value);
            updateCharCounter(editor.value);
        }

        function clearEditor() {
            editor.value = '';
            preview.innerHTML = '<p style="color: #666; font-style: italic;">Your AI-processed text will appear here...</p>';
            updateStats('');
            updateCharCounter('');
            clearActiveFormats();
        }

        function copyToClipboard() {
            const previewText = preview.textContent || preview.innerText;
            if (previewText && previewText !== 'Your AI-processed text will appear here...') {
                navigator.clipboard.writeText(previewText).then(() => {
                    showMessage('Content copied to clipboard!', 'success');
                }).catch(() => {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = previewText;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    showMessage('Content copied to clipboard!', 'success');
                });
            } else {
                showMessage('No processed content to copy', 'error');
            }
        }

        function clearActiveFormats() {
            document.querySelectorAll('.format-btn').forEach(btn => {
                btn.classList.remove('active', 'processing');
            });
        }

        async function processWithAI(element, format) {
            const rawText = editor.value.trim();
            
            // Validation
            if (!rawText) {
                showMessage('Please enter some text to process', 'error');
                return;
            }
            
            if (rawText.length > MAX_CHARS) {
                showMessage(`Text exceeds ${MAX_CHARS} character limit`, 'error');
                return;
            }
            
            if (currentProcessing) {
                showMessage('Already processing. Please wait...', 'error');
                return;
            }

            // UI updates
            currentProcessing = true;
            clearActiveFormats();
            element.classList.add('active', 'processing');
            element.innerHTML = `<div class="loading-spinner"></div><strong>Processing...</strong><br><small>AI is working on your text</small>`;
            
            try {
                const prompt = prompts[format];
                const response = await fetch(WORKER_URL + '/process', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: rawText,
                        prompt: prompt,
                        format: format,
                        sessionId: sessionId
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    updatePreview(result.processedText);
                    showMessage('Text processed successfully!', 'success');
                } else {
                    throw new Error(result.error || 'Processing failed');
                }
                
            } catch (error) {
                console.error('AI processing error:', error);
                showMessage('Failed to process text. Please try again.', 'error');
                preview.innerHTML = '<p style="color: red;">Error processing text. Please try again.</p>';
            } finally {
                currentProcessing = false;
                element.classList.remove('processing');
                
                // Restore button content
                const formatTitles = {
                    'professional-email': '📧 Professional Email',
                    'blog-post': '📝 Blog Post', 
                    'technical-summary': '📊 Technical Summary',
                    'creative-writing': '✨ Creative Writing',
                    'social-media': '📱 Social Media',
                    'documentation': '📚 Documentation'
                };
                
                const formatDescriptions = {
                    'professional-email': 'Transform to business email format',
                    'blog-post': 'Structure as engaging blog content',
                    'technical-summary': 'Create concise technical overview', 
                    'creative-writing': 'Enhance with creative flair',
                    'social-media': 'Optimize for social platforms',
                    'documentation': 'Format as clear documentation'
                };
                
                element.innerHTML = `<strong>${formatTitles[format]}</strong><br><small>${formatDescriptions[format]}</small>`;
            }
        }

        function showMessage(message, type) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
            errorMessage.style.backgroundColor = type === 'success' ? '#4CAF50' : '#ff6b6b';
            
            setTimeout(() => {
                errorMessage.style.display = 'none';
            }, 5000);
        }

        // Initialize with welcome message
        const welcomeText = `Welcome to AI Text Processor! 

Enter your raw text (up to 1000 characters) and choose an AI processing format below.

Examples:
- "Need help with project timeline" → Professional Email
- "Machine learning basics explanation" → Blog Post  
- "API documentation notes" → Technical Summary`;

        editor.value = welcomeText;
        updateStats(welcomeText);
        updateCharCounter(welcomeText);