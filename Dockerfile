# Use Node.js with Debian base (not Alpine for easier package management)
FROM node:18-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies including Python, yt-dlp, and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using Python virtual environment (to handle PEP 668)
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --no-cache-dir yt-dlp \
    && ln -s /opt/yt-dlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create output directory for temporary files
RUN mkdir -p /tmp/downloads

# Set environment variables for Cloud Run
ENV PORT=8080
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
